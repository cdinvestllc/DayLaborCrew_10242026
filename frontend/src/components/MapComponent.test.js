import { createStableJobMarker } from "./MapComponent";

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
