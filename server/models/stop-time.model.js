import Debug from 'debug'
import postgresStore from '../postgres-store.js'
const debug = Debug('ratp:stop-time')

export default class StopTime {
  /** @type {Number} */
  trip_id
  /** @type {Date} */
  arrival_time
  /** @type {Date} */
  departure_time
  /** @type {Number} */
  stop_id
  /** @type {Number} */
  stop_sequence
  /** @type {String} */
  stop_headsign
  /** @type {Number} */
  shape_dist_traveled

  async create (tripId, arrivalTime, departureTime, stopId, stopSequence, stopHeadsign, shapeDistTraveled) {
    await postgresStore.client.query({
      text: `
      INSERT INTO stop_time(trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, shape_dist_traveled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      values: [tripId, arrivalTime, departureTime, stopId, stopSequence, stopHeadsign, shapeDistTraveled]
    })
  }

  /**
   * @param {StopTime[]} stopTimes
   */
  static async bulkCreate (stopTimes) {
    const values = []
    const keys = []

    let i = 1
    for (const time of stopTimes) {
      const vals = [
        time.trip_id,
        time.arrival_time,
        time.departure_time,
        time.stop_id,
        time.stop_sequence,
        time.stop_headsign,
        time.shape_dist_traveled
      ]
      values.push(...vals)
      keys.push('(' + vals.map(_ => `$${i++}`).join(',') + ')')
    }

    await postgresStore.client.query({
      text: `
      INSERT INTO stop_time(trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, shape_dist_traveled)
      VALUES ${keys.join(',')}
      `,
      values
    })
  }

  /**
   * @param {Stop} stop
   * @param {Date} date
   * @param {Boolean} hasTransfers
   */
  /*
  static async getNextStopTime (stop, date, hasTransfers) {
    const today = new Date(date)
    today.setUTCHours(0)
    today.setUTCMinutes(0)
    today.setUTCSeconds(0)
    today.setUTCMilliseconds(0)
    const timestamp = date.getTime() - today.getTime()

    const p1 = postgresStore.client.query({
      text: 'SELECT * FROM find_next_stop_time($1, $2, $3)',
      values: [stop.id, new Date(timestamp), today]
    })

    let p2
    if (!hasTransfers) {
      p2 = postgresStore.client.query({
        text: `SELECT * FROM transfer WHERE from_stop_id = $1 OR to_stop_id = $1`,
        values: [stop.id]
      })
    }
    const [result, resultTransfers] = await Promise.all([p1, p2])
    let transfers
    if (resultTransfers && resultTransfers.rows.length) {
      transfers = resultTransfers.rows.map(t => ({
        from_stop_id: parseInt(t.from_stop_id),
        to_stop_id: parseInt(t.to_stop_id),
        transfer_type: t.transfer_type,
        min_transfer_time: t.min_transfer_time
      })) 
    } else {
      transfers = []
    }

    if (!result.rows.length) { return { transfers } }

    const r = result.rows[0] // a transport has only one next direct stoptime

    return {
      stop_id: r.stop_id,
      route_id: r.route_id,
      route_short_name: r.route_short_name,
      route_long_name: r.route_long_name,
      trip_id: r.trip_id,
      trip_direction: r.trip_direction,
      service_id: r.service_id,
      stop_sequence: r.stop_sequence,
      departure_time: r.departure_time,
      arrival_time: r.arrival_time,
      next_station: {
        stop_id: r.next_station_stop_id,
        departure_time: r.next_station_departure_time,
        arrival_time: r.next_station_arrival_time,
        stop_sequence: r.next_station_stop_sequence,
        cost: r.next_station_cost
      },
      transfers
    }
  } */

  /**
   * @param {Array<{stop: Stop, date: Date}>} items
   */
  static async getNextStopTimes (items) {
    if (!items.length) return []
    const values = []
    let inText = []
    let i = 1
    items.forEach(item => {
      const today = new Date(item.date)
      today.setUTCHours(0)
      today.setUTCMinutes(0)
      today.setUTCSeconds(0)
      today.setUTCMilliseconds(0)

      const horaire = new Date(item.date - today.getTime())

      inText.push(`find_next_stop_time_param_new($${i++}, $${i++}, $${i++})`)
      values.push(item.stop.id, horaire, today)
    })

    let results = await postgresStore.client.query({
      text: `SELECT * FROM find_next_stop_time_loop(array[${inText.join(',')}])`,
      values
    })

    if (!results.rows.length) {
      return []
    }

    return results.rows.map(stop => ({
      stop_id: stop.stop_id,
      route_id: stop.route_id,
      route_short_name: stop.route_short_name,
      route_long_name: stop.route_long_name,
      trip_id: stop.trip_id,
      trip_direction: stop.trip_direction,
      service_id: stop.service_id,
      stop_sequence: stop.stop_sequence,
      departure_time: stop.departure_time,
      arrival_time: stop.arrival_time,
      next_station: {
        stop_id: stop.next_station_stop_id,
        departure_time: stop.next_station_departure_time,
        arrival_time: stop.next_station_arrival_time,
        stop_sequence: stop.next_station_stop_sequence,
        cost: stop.next_station_cost
      }
    }))
  }

  static async generateTable () {
    await postgresStore.client.query(`
    CREATE TABLE stop_time (
      trip_id BIGINT,
      arrival_time TIMESTAMPTZ,
      departure_time TIMESTAMPTZ,
      stop_id INTEGER,
      stop_sequence INTEGER,
      stop_headsign TEXT,
      shape_dist_traveled INTEGER
    )
    `)
  }

  static async addForeignKeys () {
    await postgresStore.client.query(`
      CREATE INDEX stop_time_departure_time ON stop_time(departure_time)
    `)
    await postgresStore.client.query(`
      CREATE INDEX stop_time_stop_id_departure_time ON stop_time(stop_id, departure_time)
    `)
    await postgresStore.client.query(`
      CREATE INDEX stop_time_trip_id ON stop_time(trip_id)
    `)
    await postgresStore.client.query(`
      CREATE INDEX stop_time_trip_id_stop_sequence ON stop_time(trip_id, stop_sequence)
    `)
    await postgresStore.client.query(`
      ALTER TABLE stop_time
      ADD CONSTRAINT stop_time_trip_id
      FOREIGN KEY (trip_id)
      REFERENCES trip(id)
    `)
    await postgresStore.client.query(`
      ALTER TABLE stop_time
      ADD CONSTRAINT stop_time_stop_id
      FOREIGN KEY (stop_id)
      REFERENCES stop(id)
    `)
  }

  static async createViews () {
    await postgresStore.client.query(`
      DROP MATERIALIZED VIEW IF EXISTS find_next_bus
    `)
    await postgresStore.client.query(`
      CREATE MATERIALIZED VIEW find_next_bus AS
      SELECT
        st.stop_id AS stop_id,
        route.id AS route_id,
        route.route_short_name AS route_short_name,
        route.route_long_name AS route_long_name,
        st.trip_id AS trip_id,
        trip.direction_id AS trip_direction,
        trip.service_id AS service_id,
        st.stop_sequence AS stop_sequence,
        st.departure_time AS departure_time,
        st.arrival_time AS arrival_time
      FROM stop_time AS st
      LEFT JOIN trip AS trip
        ON st.trip_id = trip.id
      LEFT JOIN route AS route
        ON trip.route_id = route.id
      ORDER BY st.departure_time ASC
    `)
    await postgresStore.client.query(`
    CREATE OR REPLACE FUNCTION find_next_stop_time(
          start_stop_id INTEGER,
          start_time TIMESTAMPTZ,
          start_date TIMESTAMPTZ
    )
    RETURNS TABLE (
      stop_id INTEGER,
      route_id INTEGER,
      -- route_short_name TEXT,
      -- route_long_name TEXT,
      trip_id BIGINT,
      trip_direction SMALLINT,
      service_id INTEGER,
      stop_sequence INTEGER,
      departure_time TIMESTAMPTZ,
      arrival_time TIMESTAMPTZ,
      next_station_arrival_time TIMESTAMPTZ,
      next_station_departure_time TIMESTAMPTZ,
      next_station_stop_id INTEGER,
      next_station_stop_sequence INTEGER,
      next_station_cost DOUBLE PRECISION
    )
    language plpgsql
    AS $$
    BEGIN
      RETURN QUERY
        SELECT
         s1.stop_id AS stop_id,
         s1.route_id AS route_id,
         s1.trip_id AS trip_id,
         s1.trip_direction AS trip_direction,
         s1.service_id AS service_id,
         s1.stop_sequence AS stop_sequence,
         s1.departure_time AS departure_time,
         s1.arrival_time AS arrival_time,
         next_time.arrival_time AS next_station_arrival_time,
         next_time.departure_time AS next_station_departure_time,
         next_time.stop_id AS next_station_stop_id,
         next_time.stop_sequence AS next_station_stop_sequence,
         EXTRACT(EPOCH FROM (next_time.departure_time - s1.departure_time)) AS next_station_cost
         FROM (
          SELECT 
            find_next_bus.*
          FROM find_next_bus AS find_next_bus

          LEFT JOIN calendar_date AS calendar_date
            ON calendar_date.service_id = find_next_bus.service_id
               AND calendar_date.date = start_date
               AND calendar_date.exception_type = 1
          WHERE
          find_next_bus.stop_id = start_stop_id
          AND find_next_bus.departure_time >= start_time
          AND calendar_date.service_id IS NOT NULL
          ORDER BY find_next_bus.departure_time ASC
          LIMIT 1
        ) AS s1
        LEFT JOIN stop_time AS next_time
          ON next_time.trip_id = s1.trip_id
             AND next_time.stop_sequence = s1.stop_sequence + 1
        ORDER BY s1.departure_time;
    END;
    $$
    `)
    await postgresStore.client.query('DROP FUNCTION IF EXISTS find_next_stop_time_loop')
    await postgresStore.client.query('DROP FUNCTION IF EXISTS find_next_stop_time_param_new')
    await postgresStore.client.query('DROP TYPE IF EXISTS find_next_stop_time_param')
    await postgresStore.client.query(`
    CREATE TYPE find_next_stop_time_param AS (
          start_stop_id INTEGER,
          start_time TIMESTAMPTZ,
          start_date TIMESTAMPTZ
    )`)
    await postgresStore.client.query(`
      CREATE OR REPLACE FUNCTION
        find_next_stop_time_param_new(INTEGER, TIMESTAMPTZ, TIMESTAMPTZ)
        RETURNS find_next_stop_time_param AS $$
        SELECT ROW($1, $2, $3)::find_next_stop_time_param;
        $$ LANGUAGE sql IMMUTABLE;
    `)

    await postgresStore.client.query(`
      CREATE OR REPLACE FUNCTION find_next_stop_time_loop(p find_next_stop_time_param[])
      RETURNS TABLE (
        stop_id INTEGER,
        route_id INTEGER,
        -- route_short_name TEXT,
        -- route_long_name TEXT,
        trip_id BIGINT,
        trip_direction SMALLINT,
        service_id INTEGER,
        stop_sequence INTEGER,
        departure_time TIMESTAMPTZ,
        arrival_time TIMESTAMPTZ,
        next_station_arrival_time TIMESTAMPTZ,
        next_station_departure_time TIMESTAMPTZ,
        next_station_stop_id INTEGER,
        next_station_stop_sequence INTEGER,
        next_station_cost DOUBLE PRECISION
      )
        language plpgsql
          AS $$
        DECLARE i find_next_stop_time_param;
          BEGIN
          FOREACH i IN ARRAY p
          LOOP
            FOR stop_id, route_id, trip_id, trip_direction, service_id, stop_sequence, departure_time, arrival_time, next_station_arrival_time, next_station_departure_time, next_station_stop_id, next_station_stop_sequence, next_station_cost IN
              SELECT * FROM find_next_stop_time(i.start_stop_id, i.start_time, i.start_date)
            LOOP
              RETURN NEXT;
            END LOOP;
          END LOOP;
        END;
      $$
    `)
 
    await postgresStore.client.query(`
      CREATE INDEX find_next_bus_service_id ON find_next_bus(service_id)
    `)
    await postgresStore.client.query(`
      CREATE INDEX find_next_bus_stop_id_departure_time ON find_next_bus(stop_id, departure_time)
    `)
  }
}
