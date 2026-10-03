import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import type { MapRoute } from './RouteMap.tsx'
import { useEffect } from 'react'
import { latLngBounds } from 'leaflet'



interface LiveMapProps {
  routes: MapRoute[]
  height: number // px
}

/** Zooms the map so every route is visible. Renders nothing itself. */
function FitBounds({ routes }: { routes: MapRoute[] }) {
  const map = useMap()

  useEffect(() => {
    const allPoints = routes.flatMap((r) => r.points)
    if (allPoints.length > 0) {
      map.fitBounds(latLngBounds(allPoints), { padding: [24, 24] })
    }
  }, [map, routes])

  return null
}



export function LiveMap({ routes, height }: LiveMapProps) {
  const start = routes[0]?.points[0]
  if (!start) return null

  return (
    <MapContainer center={[start.lat, start.lng]} zoom={14} style={{ height }}>
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        attribution="&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors"
      />
        <FitBounds routes={routes} />
        {[...routes]
        .sort((a, b) => Number(!!a.selected) - Number(!!b.selected))
        .map((route) => (
          <Polyline
            key={route.id}
            positions={route.points}
            pathOptions={{
              color: route.color,
              weight: route.selected ? 6 : 4,
              opacity: route.selected ? 1 : 0.7,
            }}
          />
        ))}

    </MapContainer>
  )
}
