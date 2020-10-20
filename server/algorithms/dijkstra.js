import Debug from 'debug'
const debug = Debug('ratp:algorithms:dijkstra')

export class Path {
  constructor (cost, node, moreinfo) {
    /** @member {Number} cost */
    this.cost = cost
    /** @member {Node} node */
    this.node = node
    /** @member {Object} moreinfo */
    this.moreinfo = moreinfo
  }
}

export class Node {
  /**
   * @param {String} name
   * @param {Object} stop
   * @param {Function} discover
   * @param {Array<Path>} paths
   */
  constructor (name, stop = {}, discover = () => {}, paths = []) {
    /** @member {Boolean} */
    this.visited = false
    /** @member {String} */
    this.name = name
    /** @member {Array<Path>} paths */
    this.paths = paths
    /** @member {Number} distance */
    this.distance = Infinity
    /** @member {Node} visitedFrom */
    this.visitedFrom = null
    /** @member {Function} discover */
    this.discover = discover
    /** @member {Object} stop */
    this.stop = stop
    /** @member {Boolean} */
    this.start = false
    /** @member {Boolean} */
    this.end = false
  }

  export () {
    return {
      visited: this.visited,
      name: this.name,
      start: this.start,
      end: this.end,
      paths: this.paths.map(p => ({
        stop_id: p.node.stop.id,
        moreinfo: p.moreinfo
      })),
      distance: this.distance,
      visitedFrom: this.visitedFrom && this.visitedFrom.stop ? this.visitedFrom.stop.id : null,
      stop: this.stop
    }
  }

  /**
   * @param {Node} node
   * @param {Number} cost
   * @param {Object} [moreinfo]
   */
  addOrientedPath (node, cost, moreinfo) {
    const current = this.paths.findIndex(n => n.node === node)
    if (current !== -1) {
      this.paths.splice(current, 1)
    }
    this.paths.push(new Path(cost, node, moreinfo))
  }

  /**
   * @param {Node} node
   * @param {Function} cost
   */
  addNonOrientedPath (node, cost) {
    this.addOrientedPath(node, cost)
    node.addOrientedPath(this, cost)
  }

  /**
   * Calculates the new distance for each node
   * Already visited nodes shouldn't be updated
   * The {@link Node}s returned are the nodes which were never calculated before
   * @returns {Node[]|null}
   */
  calcNeighboursTentativeDistance () {
    /** @type {Node[]} */
    const toVisit = []
    for (const p of this.paths) {
      if (p.node.visited) { continue }

      if (p.node.distance === Infinity) {
        toVisit.push(p.node)
      }

      const newCost = p.cost + this.distance
      if (newCost < p.node.distance) {
        p.node.distance = newCost
        p.node.visitedFrom = this
      }
    }

    return toVisit
  }
}

export class Dijkstra {
  /**
   * Calculates the shortest path, and returns a list of nodes
   * that we need to go through to have the path
   * @param {Node} startNode
   * @param {Node} endNode
   * @param {Number} initialDistance start date
   * @returns {Array<Node>}
   */
  static async shortestPathFirst (startNode, endNode, initialDistance = 0) {
    debug('shortestPathFirst')
    if (startNode === endNode) { return [] }

    startNode.distance = initialDistance
    startNode.visited = true

    // debug('startNode distance', startNode.distance)
    /** @type {Node[]} */
    const listOfNodes = [startNode]

    await startNode.discover(startNode, startNode.distance)

    while (listOfNodes.length) {
      const curr = listOfNodes.shift()
      debug('curr:', listOfNodes.length, curr.name)
      curr.visited = true
      if (endNode === curr) {
        return Dijkstra.generatePath(endNode)
      }

      const toVisit = curr.calcNeighboursTentativeDistance()

      const toDiscover = []

      for (let i = 0; i < toVisit.length; i++) {
        if (!listOfNodes.includes(toVisit[i])) {
          const nextIndex = listOfNodes.findIndex(a => a.distance >= toVisit[i].distance)
          debug('add in listOfNodes', toVisit[i].name)
          if (nextIndex !== -1) {
            listOfNodes.splice(nextIndex, 0, toVisit[i])
          } else {
            listOfNodes.push(toVisit[i])
          }
          // listOfNodes.push(toVisit[i])
          toDiscover.push(toVisit[i])
        }
      }

      await Promise.all(toDiscover.map(n => n.discover(n, n.distance)))

      /* listOfNodes.sort((a, b) => {
        if (a.distance > b.distance) {
          return 1
        } else {
          return a.distance === b.distance ? 0 : -1
        }
      }) */
    }

    // if we reached the end of the list without finding a path
    debug("didn't find a path :/")
    return []
  }

  /**
   * Generates the path from an endNode to the startNode
   * it uses the `visitedFrom` property to navigate backwards
   * to the starting point
   * @param {Node} endNode
   * @returns {Node[]}
   */
  static generatePath (endNode) {
    const out = [endNode]
    let curr = endNode
    while (curr.visitedFrom) {
      out.unshift(curr.visitedFrom)
      curr = curr.visitedFrom
    }
    return out
  }

  /**
   * Print the path like a linked list
   * @param {Node[]} listOfNodes
   */
  /* istanbul ignore next */
  static printPath (listOfNodes) {
    let out = ''
    for (const n of listOfNodes) {
      out += `(${n.name}, ${n.distance}) => `
    }
    out += 'x'
    debug(out)
  }
}
