import express from 'express'
import Stop from '../models/stop.model.js'
import getRoute from '../algorithms/get-route.js'
const router = express.Router()

router.get('/stop', async function (req, res) {
  const { name } = req.query
  console.log('stop1')
  const stops = await Stop.getStops(name)
  console.log('stop2')
  res.json(stops)
})

/** @type {Node[]} */
const nodesArrays = []

function genOutputNodes (nodes) {
  return nodes.map(node => node.export())
}

function filterOutputNodes (nodes) {
  return genOutputNodes(nodes).filter(n => n.visited)
}

router.get('/route/updates/:id', function (req, res) {
  const id = parseInt(req.params.id)
  if (!nodesArrays[id]) {
    res.status(404)
    res.send('not found')
    return
  }

  console.log('done', nodesArrays[id].done || false)
  console.log('goodPath', nodesArrays[id].goodPath ? nodesArrays[id].goodPath.length : 0)
  res.json({
    values: filterOutputNodes(nodesArrays[id]),
    goodPath: nodesArrays[id].goodPath ? genOutputNodes(nodesArrays[id].goodPath) : [],
    timetaken: nodesArrays[id].timetaken,
    done: nodesArrays[id].done
  })

  if (nodesArrays[id].done) {
    nodesArrays.splice(id, 1)
  }
})

router.get('/route', async function (req, res) {
  try {
    const { start, stop } = req.query
    const id = Math.floor(Math.random() * 1000) + 1
    console.log('start', start)
    console.log('stop', stop)

    const date = new Date() // new Date('2020-10-19T12:52:45.114Z')

    const route = getRoute(start, stop, date)
    const { value } = await route.next()
    const now = Date.now()
    route.next()
      .then((result) => {
        console.log('finished, elapsed:', (Date.now() - now) / 1000)
        nodesArrays[id].done = true
        nodesArrays[id].timetaken = (Date.now() - now) / 1000
        nodesArrays[id].goodPath = result.value
      })

    nodesArrays[id] = value

    res.json({ values: filterOutputNodes(nodesArrays[id]), id, done: false })
  } catch (err) {
    res.status(500)
    res.json({
      message: 'La station n\'existe pas'
    })
  }
})

export default router

