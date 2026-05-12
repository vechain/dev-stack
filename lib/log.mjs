const useColor = process.stdout.isTTY && !process.env.NO_COLOR
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
const dim = (s) => c('2', s)
const bold = (s) => c('1', s)
const green = (s) => c('32', s)
const yellow = (s) => c('33', s)
const red = (s) => c('31', s)
const cyan = (s) => c('36', s)

const prefix = bold(cyan('[vechain-dev]'))

export const info = (msg) => console.log(`${prefix} ${msg}`)
export const step = (msg) => console.log(`${prefix} ${green('→')} ${msg}`)
export const warn = (msg) => console.log(`${prefix} ${yellow('!')} ${msg}`)
export const error = (msg) => console.error(`${prefix} ${red('✗')} ${msg}`)
export const detail = (msg) => console.log(`${prefix} ${dim(msg)}`)
