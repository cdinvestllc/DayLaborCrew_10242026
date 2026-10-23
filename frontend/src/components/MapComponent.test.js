globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("maplibre-gl", () => ({
  __esModule: true,
  default: { Map: jest.fn(), Marker: jest.fn() },
}));

import { createRadiusGeoJSON, createStableJobMarker } from "./MapComponent";

test("hover animation does not overwrite MapLibre's marker positioning transform", () => {
  const marker = createStableJobMarker(28, "#10B981");
  const visual = marker.firstElementChild;
  marker.style.transform = "translate(120px, 240px)";

  marker.dispatchEvent(new MouseEvent("mouseenter"));
  expect(visual.style.transform).toBe("rotate(-45deg) scale(1.2)");
  expect(marker.style.transform).toBe("translate(120px, 240px)");

  marker.dispatchEvent(new MouseEvent("mouseleave"));
  expect(visual.style.transform).toBe("rotate(-45deg) scale(1)");
  expect(marker.style.transform).toBe("translate(120px, 240px)");
});


test("search radius helper returns a closed geodesic polygon at the selected radius", () => {
  const geojson = createRadiusGeoJSON([-84.39, 33.75], 25, 32);
  expect(geojson.features).toHaveLength(1);
  expect(geojson.features[0].properties.radius_miles).toBe(25);
  const ring = geojson.features[0].geometry.coordinates[0];
  expect(ring).toHaveLength(33);
  expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 10);
  expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 10);
});

test("search radius helper returns no polygon when the distance filter is cleared", () => {
  expect(createRadiusGeoJSON([-84.39, 33.75], null)).toEqual({ type: "FeatureCollection", features: [] });
});
