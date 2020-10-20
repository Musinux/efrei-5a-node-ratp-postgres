import Debug from 'debug'
import StopTime from '../models/stop-time.model.js'
import Stop from '../models/stop.model.js'
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
  if (!startStops.length || !endStops.length) {
    debug('no stops start:', startStops.length, 'end:', endStops.length)
    return []
  }

  date = new Date(date) // has to be ISO date

  /** @type { Array<Stop> } */
  const between = await Stop.getStopsBetweenTwoStops(startStops[0], endStops[0])

  const nodesByStopId = {}

  const nodes = between.map(stop =>
    new Node(stop.stop_name, stop, (node, time) => discover(node, nodesByStopId, time))
  )

  nodes.forEach(n => (nodesByStopId[n.stop.id] = n))

  yield nodes // we give a first result which is the list of points

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

  const out = await Dijkstra.shortestPathFirst(startNode, endNode, date.getTime())

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
 * Each time we visit a node, it helps us determine the next possible paths
 * So we can add new paths with the associated costs
 * Two possible ways:
 *  * transfers, with have cost in minutes
 *  * nextStationCost, which have cost in milliseconds
 * @param {Node} node
 * @param {Object.<number, Node>} nodes
 * @param {Stop} stop
 * @param {String} time
 */
async function discover (node, nodes, time) {
  debug('discover')
  const stop = node.stop
  const stoptimes = await StopTime.getNextStopTimes(stop, new Date(time))
  node.stoptimes = stoptimes

  for (const time of stoptimes) {
    if (time.next_station && time.next_station.stop_id && time.next_station.cost) {
      const nextStationNode = nodes[time.next_station.stop_id]
      if (nextStationNode) {
        /*
         // disabled in the sql query
        const moreinfo = {
          route_short_name: time.route_short_name,
          route_long_name: time.route_long_name
        }
        */
        debug('next station', time.next_station.stop_id)

        node.addOrientedPath(nextStationNode, time.next_station.cost)
      }
    }

    for (const transfer of time.transfers) {
      // here we try to find the nodes that are linked to our current stop
      // we are checking each node where the stop_id is equal to from_stop_id or
      // to_stop_id
      let transferNode

      if (transfer.from_stop_id === time.stop_id) {
        transferNode = nodes[transfer.to_stop_id]
      } else if (transfer.to_stop_id === time.stop_id) {
        transferNode = nodes[transfer.from_stop_id]
      }

      if (!transferNode) {
        continue
      }
      debug('transfer', transferNode.name)
      // transfers are not oriented because it's by feet
      node.addNonOrientedPath(transferNode, transfer.min_transfer_time)
    }
  }
}
