const http =
  require('node:http')

const HOST =
  '127.0.0.1'

const PORT =
  47891

let server = null
let connected = false
let directDomains = []

function setVirtualLocationConnected(value) {
  connected = value === true
}

function setDirectDomains(domains) {
  directDomains = Array.isArray(domains) ? domains : []
}

async function startVirtualLocationService() {
  if (server) {
    return
  }

  server =
    http.createServer(
      (request, response) => {
        response.setHeader(
          'Access-Control-Allow-Origin',
          '*',
        )
        response.setHeader(
          'Access-Control-Allow-Methods',
          'GET, OPTIONS',
        )
        response.setHeader(
          'Cache-Control',
          'no-store',
        )

        if (
          request.method ===
          'OPTIONS'
        ) {
          response.writeHead(204)
          response.end()
          return
        }

        if (
          request.method !==
            'GET' ||
          request.url !==
            '/status'
        ) {
          response.writeHead(
            404,
            {
              'Content-Type':
                'application/json; charset=utf-8',
            },
          )
          response.end(
            JSON.stringify({
              error:
                'Not found',
            }),
          )
          return
        }

        response.writeHead(
          200,
          {
            'Content-Type':
              'application/json; charset=utf-8',
          },
        )

        response.end(
          JSON.stringify({
            connected,
            directDomains,
            application: 'HamidsDeutsch Connect',
            updatedAt: new Date().toISOString(),
          }),
        )
      },
    )

  await new Promise(
    (resolve, reject) => {
      server.once(
        'error',
        reject,
      )

      server.listen(
        PORT,
        HOST,
        () => {
          server.off(
            'error',
            reject,
          )
          resolve()
        },
      )
    },
  )
}

async function stopVirtualLocationService() {
  connected = false

  if (!server) {
    return
  }

  const current =
    server

  server = null

  await new Promise(
    (resolve) => {
      current.close(
        () => resolve(),
      )
    },
  )
}

module.exports = {
  startVirtualLocationService,
  stopVirtualLocationService,
  setVirtualLocationConnected,
  setDirectDomains,
}
