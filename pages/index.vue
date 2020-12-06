<template>
  <div id="map-container">
    <input v-model="startStop" type="text" placeholder="Start Stop">
    <input v-model="endStop" type="text" placeholder="End Stop">
    <button @click="start" :disabled="running">
      Get the route
    </button>
    <span v-if="time">{{ time }} minutes de trajet</span>
    <span v-if="noPath">Aucun chemin trouvé</span>
    <span v-if="timetaken">Calculé en {{ timetaken }} secondes</span>
    <span v-if="lag">Lag de l'UI: {{ lag }} secondes</span>
    <div id="map" />
  </div>
</template>

<script>
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import { fromLonLat } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control'
import Feature from 'ol/Feature'
import OSM from 'ol/source/OSM'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle, LineString } from 'ol/geom'
import { Style, Stroke, Fill, Text } from 'ol/style'

function setStyle ({ strokeColor, fillColor }) {
  return new Style({
    stroke: new Stroke({ color: strokeColor, opacity: 1, width: 2 }),
    fill: new Fill({ opacity: 0.2, color: fillColor })
  })
}

const visitedStyle = setStyle({
  strokeColor: 'green',
  fillColor: 'green'
})

const goodPathStyle = setStyle({
  strokeColor: 'red',
  fillColor: 'red',
  textColor: 'red'
})

const circleStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 0, 0, 0.2)' }),
  stroke: new Stroke({ color: 'red', width: 3 }),
  text: new Text({
    font: '15px Calibri,sans-serif',
    fill: new Fill({ opacity: 0.2, color: 'rgba(150, 0, 0, 0.8)' }),
    stroke: new Stroke({ color: 'red' }),
    color: 'red'
  })
})

export default {
  data: () => ({
    startStop: 'MAIRIE DE LEVALLOIS',
    endStop: "MAIRIE D'ALFORTVILLE",
    running: false,
    listOfNodes: [],
    map: null,
    allLayers: [],
    time: 0,
    timetaken: 0,
    lag: 0,
    noPath: false,
    alreadyDefinedPaths: [],
    dotsLayer: null,
    linesLayer: null,
    goodPathLayer: null,
    stopUpdating: false
  }),
  mounted () {
    this.linesLayer = new VectorLayer({
      source: new VectorSource(),
      style: visitedStyle
    })

    this.goodPathLayer = new VectorLayer({
      source: new VectorSource(),
      style: goodPathStyle
    })

    this.dotsLayer = new VectorLayer({
      source: new VectorSource(),
      style (feature) {
        circleStyle.getText().setText(feature.get('name'))
        return circleStyle
      }
    })
    this.map = new Map({
      target: 'map',
      layers: [
        new TileLayer({ source: new OSM() }),
        this.linesLayer,
        this.goodPathLayer,
        this.dotsLayer
      ],
      view: new View({
        center: fromLonLat([2.3522, 48.8566]),
        zoom: 12,
        projection: 'EPSG:900913'
      }),
      controls: defaultControls(),
      numZoomLevels: 19,
      units: 'm'
    })
  },
  methods: {
    async start () {
      this.running = true
      const now = Date.now()
      const startStop = encodeURIComponent(this.startStop)
      const endStop = encodeURIComponent(this.endStop)
      /** @type {Node[]} */
      const { id } = await this.$axios.$get(`/api/route?start=${startStop}&stop=${endStop}`)

      // if (!values) { return }

      // this.updateNodes(values)

      const inter = setInterval(async () => {
        try {
          const { done, timetaken, goodPath } = await this.$axios.$get(`/api/route/updates/${id}`)

          if (done) {
            clearInterval(inter)
            console.log('goodPath', goodPath)
            this.traceGoodPath(goodPath)
            this.showTime(goodPath)
            this.timetaken = timetaken
            this.lag = ((Date.now() - now) - timetaken * 1000) / 1000
            this.running = false
          }

          // await this.updateNodes(values)
        } catch (err) {
          console.log('error', err)
          clearInterval(inter)
          this.running = false
        }
      }, 2000)
    },

    showTime (path) {
      if (!path.length) {
        this.noPath = true
        return
      }
      console.log('path', path)
      this.time = ((path[path.length - 1].distance - path[0].distance) / 60)
    },

    traceGoodPath (nodes) {
      let end = null
      console.log('trace path !')
      nodes.forEach((node) => {
        const stop = node.stop
        const start = [stop.longitude, stop.latitude]
        console.log('stopname', stop.stop_name)
        this.addCircle(stop.latitude, stop.longitude, 100, 'red', stop.stop_name)
        if (end) {
          const line = this.genLine(start, end)
          this.goodPathLayer.getSource().addFeature(line)
        }
        end = [stop.longitude, stop.latitude]
      })
    },

    compareCoords ([refStart, refStop], [start, stop]) {
      return (refStart[0] === start[0] && refStart[1] === start[1] && refStop[0] === stop[0] && refStop[1] === stop[1]) ||
        (refStart[0] === stop[0] && refStart[1] === stop[1] && refStop[0] === start[0] && refStop[1] === start[1])
    },

    timeout (ms) {
      return new Promise(resolve => setTimeout(resolve, ms))
    },

    async updateNodes (nodes) {
      let lines = []
      for (const node of nodes) {
        if (this.stopUpdating) { break }
        const stop = node.stop
        const coordsStart = [stop.longitude, stop.latitude]

        node.paths.forEach((path) => {
          const endNode = nodes.find(n => n.stop.id === path.stop_id)
          if (!endNode) { return }

          const coordsEnd = [endNode.stop.longitude, endNode.stop.latitude]
          const pathAlreadyExists = this.alreadyDefinedPaths
            .find(_ => this.compareCoords(_, [coordsStart, coordsEnd]))

          if (pathAlreadyExists) { return }

          this.alreadyDefinedPaths.push([coordsStart, coordsEnd])
          lines.push(this.genLine(coordsStart, coordsEnd))
        })
        if (lines.length >= 300) {
          this.linesLayer.getSource().addFeatures(lines)
          lines = []
          await this.timeout(100)
        }
      }
      if (lines.length) {
        this.linesLayer.getSource().addFeatures(lines)
      }
    },

    genLine (start, end) {
      return new Feature({
        geometry: new LineString([
          fromLonLat(start),
          fromLonLat(end)
        ])
      })
    },

    genCircle (lat, lng, radius, color, name) {
      return new Feature({
        geometry: new Circle(fromLonLat([lng, lat]), radius),
        name
      })
    },

    addCircle (lat, lng, radius, color = 'red', name) {
      this.dotsLayer.getSource()
        .addFeature(this.genCircle(lat, lng, radius, color, name))
    },

    setCenter (lat, lng, zoom) {
      const lonlat = fromLonLat([lng || 2.3522, lat || 48.8566])
      this.map.getView().setCenter(lonlat)
    }
  }
}
</script>
<style>
html, body {
  height: 98%;
  margin: 0;
}

#__nuxt, #__layout, #__layout div, #map-container, #map {
  height: 100%;
  margin: 0;
}

.ol-attribution {
  display: none
}
</style>
