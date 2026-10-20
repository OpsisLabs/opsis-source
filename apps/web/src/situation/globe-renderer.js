import { situationText } from "./copy.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function createGlobe(el, events, onSelect) {
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 3.9);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x1d1d1d, 0);
  el.append(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive event globe. Drag to rotate, scroll to zoom.",
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2.4;
  controls.maxDistance = 5.2;
  controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.8;
  controls.enableZoom = true;
  const group = new THREE.Group();
  scene.add(group);
  const map = new THREE.TextureLoader().load(
    new URL("./assets/earth.jpg", import.meta.url).href,
  );
  map.colorSpace = THREE.SRGBColorSpace;
  const day = new THREE.TextureLoader().load(
    new URL("./assets/earth-day.jpg", import.meta.url).href,
  );
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { night: { value: map }, day: { value: day } },
      vertexShader: `varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D night;uniform sampler2D day;varying vec2 vUv;varying vec3 vNormal;void main(){vec3 t=texture2D(night,vUv).rgb;float lum=dot(t,vec3(.299,.587,.114));float light=.38+.62*max(dot(normalize(vNormal),normalize(vec3(-.5,.7,1.))),0.);vec3 d=texture2D(day,vUv).rgb;float land=clamp((d.r+d.g*.4-d.b*.7)*3.,0.,1.);float terrain=dot(d,vec3(.299,.587,.114));vec3 base=mix(vec3(.048,.049,.047),vec3(.21,.20,.18)+vec3(terrain*.30),land)*light;float cities=max(t.r-t.b*.72,0.);vec3 glow=vec3(1.,.39,.085)*pow(cities,.72)*5.0;gl_FragColor=vec4(base+glow,1.);}`,
    }),
  );
  group.add(earth);
  scene.add(new THREE.AmbientLight(0xe5d8c5, 1.8));
  let sun = new THREE.DirectionalLight(0xffcb91, 2.5);
  sun.position.set(-3, 3, 4);
  scene.add(sun);
  const geo = new THREE.SphereGeometry(1.008, 40, 24);
  const grid = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({
      color: 0x9e7960,
      transparent: true,
      opacity: 0.038,
    }),
  );
  group.add(grid);
  const xyz = (lat, lon, r = 1.012) => {
    let a = ((90 - lat) * Math.PI) / 180,
      b = ((lon + 180) * Math.PI) / 180;
    return new THREE.Vector3(
      -r * Math.sin(a) * Math.cos(b),
      r * Math.cos(a),
      r * Math.sin(a) * Math.sin(b),
    );
  };
  const labels = events.map((e, i) => {
    const v = xyz(e.lat, e.lon);
    let dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfa6c34 }),
    );
    dot.position.copy(v);
    group.add(dot);
    let ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.024, 40),
      new THREE.MeshBasicMaterial({
        color: 0xfa6c34,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
      }),
    );
    ring.position.copy(v.clone().multiplyScalar(1.002));
    ring.lookAt(v.clone().multiplyScalar(2));
    group.add(ring);
    let button = document.createElement("button");
    button.className = "globe-marker";
    const number = document.createElement("b"),
      label = document.createElement("span");
    number.textContent = String(i + 1);
    label.textContent = e.location;
    button.append(number, label);
    button.setAttribute("aria-label", "Show " + e.title);
    button.onclick = () => onSelect(i);
    el.append(button);
    return { v, button, label, ring, dot };
  });
  // Coordinates locate publishers/meeting venues only; curves are not transfer routes.
  for (let i = 0; i < events.length - 1; i++) {
    const a = xyz(events[i].lat, events[i].lon, 1),
      b = xyz(events[i + 1].lat, events[i + 1].lon, 1);
    const theta = a.angleTo(b);
    if (theta < 0.001) continue;
    const vertices = [];
    for (let k = 0; k <= 80; k++) {
      let t = k / 80;
      let v = a
        .clone()
        .multiplyScalar(Math.sin((1 - t) * theta))
        .add(b.clone().multiplyScalar(Math.sin(t * theta)))
        .divideScalar(Math.sin(theta))
        .multiplyScalar(1.016 + Math.sin(Math.PI * t) * 0.095);
      vertices.push(v);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(vertices),
      new THREE.LineDashedMaterial({
        color: 0xfa6c34,
        dashSize: 0.014,
        gapSize: 0.013,
        transparent: true,
        opacity: 0.44,
      }),
    );
    line.computeLineDistances();
    group.add(line);
  }
  let angle = 0.2,
    targetAngle = 0.2,
    selected = 0,
    targetDistance = 3.9,
    travel = 0;
  group.rotation.y = angle;
  group.rotation.x = 0.12;
  controls.addEventListener("start", () => {
    targetDistance = camera.position.length();
    travel = 0;
  });
  let frame;
  const resize = () => {
    const { width, height } = el.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  function animate(t) {
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    angle += (targetAngle - angle) * 0.028;
    group.rotation.y = angle;
    if (travel > 0) {
      travel = Math.max(0, travel - 0.012);
      camera.position.setLength(
        targetDistance + Math.sin(travel * Math.PI) * 0.62,
      );
    }
    controls.update();
    const { width, height } = el.getBoundingClientRect();
    labels.forEach((m, i) => {
      const world = m.v.clone().applyMatrix4(group.matrixWorld);
      const front =
        world.clone().normalize().dot(camera.position.clone().normalize()) >
        0.1;
      const p = world.project(camera);
      m.button.style.left = (p.x * 0.5 + 0.5) * width + "px";
      m.button.style.top = (-p.y * 0.5 + 0.5) * height + "px";
      m.button.style.opacity = front ? "1" : "0";
      m.button.style.pointerEvents = front ? "auto" : "none";
      m.button.tabIndex = front ? 0 : -1;
      m.button.classList.toggle("selected", selected === i);
      m.ring.scale.setScalar(
        selected === i ? 1.3 + Math.sin(t / 500) * 0.25 : 1,
      );
      m.dot.scale.setScalar(selected === i ? 1.4 : 1);
    });
    renderer.render(scene, camera);
  }
  animate(0);
  return {
    setLocale(locale) {
      labels.forEach((marker, i) => {
        marker.label.textContent = situationText(events[i].location, locale);
        marker.button.setAttribute(
          "aria-label",
          (locale === "zh-CN" ? "显示：" : "Show ") +
            situationText(events[i].title, locale),
        );
      });
    },
    select(i) {
      selected = i;
      controls.autoRotate = false;
      camera.position.set(0, 0.12, camera.position.length());
      controls.target.set(0, 0, 0);
      let target = -Math.PI / 2 - (events[i].lon * Math.PI) / 180;
      while (target - angle > Math.PI) target -= Math.PI * 2;
      while (target - angle < -Math.PI) target += Math.PI * 2;
      targetAngle = target;
      targetDistance = 3.65;
      travel = 1;
    },
    reset() {
      targetAngle = -0.65;
      camera.position.set(0, 0.15, 3.9);
      targetDistance = 3.9;
      travel = 0;
      controls.autoRotate = true;
    },
    toggle() {
      controls.autoRotate = !controls.autoRotate;
      return controls.autoRotate;
    },
    dispose() {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((x) => {
        x.geometry?.dispose();
        if (x.material) x.material.dispose();
      });
      map.dispose();
      day.dispose();
      renderer.dispose();
      el.replaceChildren();
    },
  };
}
