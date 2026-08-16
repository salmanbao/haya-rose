const fs = require("fs")
const path = require("path")

const loadEnvFile = (filename) => {
  const envPath = path.join(__dirname, filename)
  if (!fs.existsSync(envPath)) {
    return
  }

  const lines = fs.readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) {
      continue
    }

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadEnvFile(".env.local")
loadEnvFile(".env")

const nextJest = require("next/jest")

const createJestConfig = nextJest({ dir: "./" })

const customJestConfig = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    "^@lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@modules/(.*)$": "<rootDir>/src/modules/$1",
    "^@pages/(.*)$": "<rootDir>/src/pages/$1",
  },
}

module.exports = createJestConfig(customJestConfig)