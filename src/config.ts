export const getIntFromEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name]
  if (value === undefined) {
    return defaultValue
  }
  const number = parseInt(value, 10)
  if (isNaN(number)) {
    return defaultValue
  }
  return number
}

export const getFloatFromEnv = (name: string, defaultValue: number): number => {
  const value = process.env[name]
  if (value === undefined) {
    return defaultValue
  }
  const number = parseFloat(value)
  if (isNaN(number)) {
    return defaultValue
  }
  return number
}
