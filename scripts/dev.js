import { existsSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const apiUrl = process.env.RESOURCE_API_URL || 'http://127.0.0.1:8000'
const externalApiConfigured = Boolean(process.env.RESOURCE_API_URL)
const pythonExecutable = process.platform === 'win32'
  ? path.join('Scripts', 'python.exe')
  : path.join('bin', 'python')
const venvPath = path.join(root, '.venv')
const venvPython = path.join(venvPath, pythonExecutable)
const python = process.env.PYTHON
  || (process.env.VIRTUAL_ENV
    ? path.join(process.env.VIRTUAL_ENV, pythonExecutable)
    : venvPython)
const vitePath = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = []

function runSetup(command, args, description) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw new Error(`Could not ${description}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`Could not ${description} (exit code ${result.status ?? 'unknown'}).`)
  }
}

function ensurePythonDependencies() {
  if (!process.env.PYTHON && !process.env.VIRTUAL_ENV && !existsSync(venvPython)) {
    const bootstrapPython = process.platform === 'win32' ? 'py' : 'python3.12'
    const bootstrapArgs = process.platform === 'win32'
      ? ['-3.12', '-m', 'venv', '.venv']
      : ['-m', 'venv', '.venv']
    console.log('Creating the project Python 3.12 environment (.venv)...')
    try {
      runSetup(bootstrapPython, bootstrapArgs, 'create the Python environment')
    } catch (error) {
      rmSync(venvPath, { recursive: true, force: true })
      throw new Error(
        `Could not create the Python environment. This system may be missing Python 3.12 venv support. On Debian/Ubuntu, install it with "sudo apt-get install python3.12-venv", then run "npm run dev" again.`,
        { cause: error },
      )
    }
  }

  const pipCheck = spawnSync(
    python,
    ['-m', 'pip', '--version'],
    { cwd: root, env: process.env, stdio: 'ignore' },
  )
  if (pipCheck.status !== 0) {
    const pipBootstrap = spawnSync(
      python,
      ['-m', 'ensurepip', '--upgrade'],
      { cwd: root, env: process.env, stdio: 'inherit' },
    )
    if (pipBootstrap.status !== 0) {
      throw new Error(
        `The Python environment at ${python} has no pip and cannot bootstrap it. Install Python 3.12 venv support with "sudo apt-get install python3.12-venv", then remove the incomplete .venv directory and rerun "npm run dev".`,
      )
    }
  }

  const dependencyCheck = spawnSync(
    python,
    ['-c', 'import fastapi, joblib, numpy, pandas, sklearn, uvicorn'],
    { cwd: root, env: process.env, stdio: 'ignore' },
  )
  if (dependencyCheck.status === 0) return

  console.log('Installing the existing backend requirements into the selected Python environment...')
  runSetup(python, ['-m', 'pip', 'install', '-r', 'requirements-model.txt'], 'install backend requirements')
  const verification = spawnSync(
    python,
    ['-c', 'import fastapi, joblib, numpy, pandas, sklearn, uvicorn'],
    { cwd: root, env: process.env, stdio: 'ignore' },
  )
  if (verification.status !== 0) {
    throw new Error(`Backend dependencies are still unavailable in ${python}.`)
  }
}

function startProcess(command, args, name) {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  })
  children.push(child)
  child.once('error', (error) => {
    console.error(`Could not start ${name}: ${error.message}`)
  })
  return child
}

async function apiIsHealthy() {
  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return false
    const result = await response.json()
    return result.status === 'ok'
  } catch {
    return false
  }
}

async function waitForApi(child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`FastAPI exited before becoming healthy (exit code ${child.exitCode}).`)
    }
    if (await apiIsHealthy()) return
    await delay(500)
  }
  throw new Error(
    `FastAPI did not become healthy at ${apiUrl}. Check the Python dependency setup and API startup output above.`,
  )
}

async function stopChildren() {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }
    child.once('exit', resolve)
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 3000).unref()
  })))
}

let shuttingDown = false
async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  await stopChildren()
  process.exit(code)
}

process.once('SIGINT', () => { void shutdown(130) })
process.once('SIGTERM', () => { void shutdown(143) })

try {
  const existingApi = await apiIsHealthy()
  let backend = null
  if (!existingApi) {
    if (externalApiConfigured) {
      throw new Error(`Configured FastAPI service is not healthy at ${apiUrl}.`)
    }
    ensurePythonDependencies()
    console.log(`Starting FastAPI with ${python}...`)
    backend = startProcess(python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'], 'FastAPI')
    await waitForApi(backend)
    console.log('FastAPI is healthy; starting Vite.')
  } else {
    console.log(`Using the existing FastAPI service at ${apiUrl}.`)
  }

  const vite = startProcess(process.execPath, [vitePath, ...process.argv.slice(2)], 'Vite')
  const exitCode = await new Promise((resolve) => {
    vite.once('error', () => resolve(1))
    vite.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })
  await shutdown(exitCode)
} catch (error) {
  console.error(error.message)
  await shutdown(1)
}
