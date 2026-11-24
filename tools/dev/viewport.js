const vendor = new URL('../../src/vendor/three-gltf.part.js', import.meta.url);

export async function loadGraphics() {
  const response = await fetch(vendor);
  if (!response.ok) throw new Error('Three 로드 실패 (' + response.status + ')');
  const source = await response.text();
  const moduleUrl = URL.createObjectURL(new Blob([
    source, '\nexport {three_module_exports as T, GLTFLoader};\n'
  ], {type:'text/javascript'}));
  try {
    return await import(moduleUrl);
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}

export function workspaceUrl(path, allowed, extension) {
  const root = new URL('../../', import.meta.url);
  const url = new URL(path, root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) ||
      !allowed.some(dir => url.pathname.startsWith(new URL(dir, root).pathname)) ||
      !url.pathname.endsWith(extension) || url.hash || url.search) {
    throw new Error('지원하는 저장소 내부 경로를 입력해');
  }
  return url;
}

export function createViewport(T, canvas) {
  const renderer = new T.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x24272c);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, .01, 2500);
  const target = new T.Vector3();
  let azimuth = .25, elevation = .08, distance = 3, baseDistance = 3;
  let grid = new T.GridHelper(20, 20, 0x727980, 0x42474e);
  scene.add(grid, new T.HemisphereLight(0xe3efff, 0x78675b, 2));
  const key = new T.DirectionalLight(0xffeedb, 2.4);
  key.position.set(-3, 6, 4);
  scene.add(key);

  function render() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const adjusted = distance / Math.min(1, camera.aspect);
    camera.position.copy(target).add(new T.Vector3(
      Math.sin(azimuth)*Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth)*Math.cos(elevation)
    ).multiplyScalar(adjusted));
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  function frame(bounds) {
    bounds.getCenter(target);
    const size = bounds.getSize(new T.Vector3());
    baseDistance = Math.max(.1, size.length() * 1.4);
    distance = baseDistance;
    const cells = Math.min(200, Math.max(20, 2 * Math.ceil(Math.max(size.x, size.z))));
    grid.removeFromParent();
    grid.dispose();
    grid = new T.GridHelper(cells, cells, 0x727980, 0x42474e);
    grid.position.set(target.x, bounds.min.y - .005, target.z);
    scene.add(grid);
    render();
  }

  function zoom(factor) {
    distance = Math.max(baseDistance * .25, Math.min(baseDistance * 8, distance * factor));
  }

  const pointers = new Map();
  const span = () => {
    const [a,b] = [...pointers.values()];
    return Math.hypot(a[0]-b[0], a[1]-b[1]);
  };
  canvas.addEventListener('pointerdown', event => {
    if (pointers.size >= 2) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
  });
  canvas.addEventListener('pointermove', event => {
    const old = pointers.get(event.pointerId);
    if (!old) return;
    const previousSpan = pointers.size === 2 ? span() : 0;
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
    if (previousSpan) zoom(previousSpan / Math.max(1, span()));
    else {
      azimuth -= (event.clientX-old[0])*.008;
      elevation = Math.max(-1.35, Math.min(1.35, elevation + (event.clientY-old[1])*.008));
    }
    render();
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    canvas.addEventListener(type, event => pointers.delete(event.pointerId));
  }
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    zoom(Math.exp(event.deltaY*.001));
    render();
  }, {passive:false});
  new ResizeObserver(render).observe(canvas);
  return {scene, frame, render};
}
