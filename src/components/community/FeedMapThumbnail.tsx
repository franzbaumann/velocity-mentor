import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import { decodePolyline } from "@/lib/polyline";
import "leaflet/dist/leaflet.css";

const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_DARK = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";

function MapFitBounds({ latlng }: { latlng: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (latlng.length >= 2) {
      map.fitBounds(
        [
          [Math.min(...latlng.map((p) => p[0])), Math.min(...latlng.map((p) => p[1]))],
          [Math.max(...latlng.map((p) => p[0])), Math.max(...latlng.map((p) => p[1]))],
        ],
        { padding: [12, 12] }
      );
    }
  }, [map, latlng]);
  return null;
}

export function FeedMapThumbnail({
  polyline,
  isDark,
}: {
  polyline: string;
  isDark?: boolean;
}) {
  const latlng = decodePolyline(polyline);
  if (latlng.length < 2) return null;

  const center = latlng[Math.floor(latlng.length / 2)];

  return (
    <div className="relative h-[160px] rounded-lg overflow-hidden border border-border bg-muted">
      <MapContainer
        center={[center[0], center[1]]}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          attribution=""
          url={isDark ? TILE_DARK : TILE_LIGHT}
        />
        <Polyline positions={latlng} color="hsl(25 95% 53%)" weight={4} opacity={0.95} />
        <MapFitBounds latlng={latlng} />
      </MapContainer>
    </div>
  );
}
