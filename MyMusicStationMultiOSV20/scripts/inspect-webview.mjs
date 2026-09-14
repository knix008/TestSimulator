const port = process.argv[2] || '9226'

const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = pages[0]
if (!page) {
  console.error('No page found')
  process.exit(1)
}

console.log('url=', page.url)
console.log('title=', page.title)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

let nextId = 0
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id === id) {
        ws.removeEventListener('message', onMessage)
        resolve(message)
      }
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
const expression = `
(() => {
  const root = document.getElementById('root')
  return {
    href: location.href,
    ready: document.readyState,
    title: document.title,
    rootLen: root ? root.innerHTML.length : -1,
    bodyText: (document.body && document.body.innerText || '').slice(0, 400),
    scripts: [...document.scripts].map((script) => script.src),
    hasStation: Boolean(document.querySelector('.station-shell')),
  }
})()
`

const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: false,
})

console.log(JSON.stringify(result.result?.result?.value ?? result, null, 2))
ws.close()
