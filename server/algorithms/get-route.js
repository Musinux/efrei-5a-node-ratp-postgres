import Debug from 'debug'
import StopTime from '../models/stop-time.model.js'
import Stop from '../models/stop.model.js'
import Transfer from '../models/transfer.model.js'
import { Dijkstra, Node } from './dijkstra.js'
const debug = Debug('ratp:algorithms:get-route')

/**
 * @typedef { import("../models/stop.model.js").Stop } Stop
 */

export default async function * getRoute (startStopName, endStopName, date) {
  // getStop has a problem: stations are split in 2 because of the two ways
  // we need to use getStops which retrieves all stations that match the name
  // but, we should (TODO it's not done yet) restrict station names based on some
  // "near" field because some stations are named the same way in different cities,
  // like "VERDUN - République"
  const startStops = await Stop.getStops(startStopName)
  const endStops = await Stop.getStops(endStopName)
  const transfers = await Transfer.getAllTransfers()

  if (!startStops.length || !endStops.length) {
    debug('no stops start:', startStops.length, 'end:', endStops.length)
    return []
  }

  date = new Date(date) // has to be ISO date

  /** @type { Array<Stop> } */
  const between = await Stop.getStopsBetweenTwoStops(startStops[0], endStops[0])

  const nodesByStopId = {}

  const nodes = between.map(stop => new Node(stop.stop_name, stop))

  nodes.forEach(n => (nodesByStopId[n.stop.id] = n))

  yield nodes // we give a first result which is the list of points

  transfers.forEach(t => {
    const from = nodesByStopId[t.from_stop_id]
    const to = nodesByStopId[t.to_stop_id]
    if (from && to) {
      from.addNonOrientedPath(to, t.min_transfer_time)
    }
  })

  const startNodes = startStops
    .map(ss => nodesByStopId[ss.id])
    .filter(_ => _)
  startNodes.forEach(n => (n.start = true))

  // we create a root node pointing to all the first nodes
  const startNode = new Node('Start')
  createStartNodeRoutes(startNode, startNodes)

  const endNodes = endStops
    .map(ss => nodesByStopId[ss.id])
    .filter(_ => _)
  endNodes.forEach(n => (n.end = true))

  // we create a end node pointed by all the endNodes
  const endNode = new Node('Stop')
  createEndNodeRoutes(endNode, endNodes)

  const out = await Dijkstra.shortestPathFirst(startNode, endNode, nodesByStopId, date.getTime())

  if (out.length) {
    out.shift() // remove the first element, only here to simplify the algorithm
    out.pop() // remove the last element, only here to simplify the algorithm
  }
  yield out
}

function createStartNodeRoutes (node, startNodes) {
  startNodes.forEach(n => node.addOrientedPath(n, 0))
}

function createEndNodeRoutes (node, endNodes) {
  endNodes.forEach(n => n.addOrientedPath(node, 0))
}

/**
 * @param {Object<Number, Node>} allNodes 
 * @param {Node[]} newNodes
 */
export async function discoverNodes (allNodes, newNodes) {
  const opts = newNodes.map(n => ({
    stop: n.stop,
    date: n.distance
  }))

  const nexts = await StopTime.getNextStopTimes(opts)

  nexts.forEach(next => {
    if (next.next_station && next.next_station.stop_id) {
      const node = allNodes[next.stop_id]
      if (allNodes[next.next_station.stop_id]) {
        node.addOrientedPath(allNodes[next.next_station.stop_id], next.next_station.cost)
      }
    }
  })
}
