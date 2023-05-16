let gl;
let canvas;
let legacygl;
let drawutil;
let camera;
let is_dragging = false;

// ボーンの情報を格納するグローバル変数
// note: `position` の要素は関数 `update_position` を用いて計算する
const linkages = [
  { position: [0, 0], angle: 0, length: 0.8 }, // index: 0
  { position: [0, 0], angle: 0, length: 0.9 }, // index: 1
  { position: [0, 0], angle: 0, length: 1.5 }, // index: 2
  { position: [0, 0], angle: 0, length: 0.7 }, // index: 3
];

// グローバル変数 `linkages` の各要素それぞれの `angle` と `length` の値を使い、
// Forward Kinematics (FK) の考え方でそれぞれのボーンの先端位置を計算して `position` に格納する
// note: この関数はCCD法の計算中にも呼び出されることになる
function update_position() {
  linkages.forEach(function (linkage, index) {
    // note: このプログラムではルートとなるボーン（index = 0）の根本位置は原点とする
    linkage.position = [0, 0];

    // note: このプログラムでは角度はラジアンではなく度で保持する
    let angle_sum = 0;
    for (let j = 0; j <= index; ++j) {
      angle_sum += linkages[j].angle;
      linkage.position[0] += linkages[j].length * Math.cos(angle_sum * Math.PI / 180);
      linkage.position[1] += linkages[j].length * Math.sin(angle_sum * Math.PI / 180);
    }
  });
};

function compute_ik(target_position) {
  // TODO: ここにCCD法を実装する
};

function draw() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // projection & camera position
  mat4.perspective(legacygl.uniforms.projection.value, Math.PI / 6, canvas.aspect_ratio(), 0.1, 1000);
  const modelview = legacygl.uniforms.modelview;
  camera.lookAt(modelview.value);

  // xy grid
  gl.lineWidth(1);
  legacygl.color(0.5, 0.5, 0.5);
  drawutil.xygrid(100);

  // linkages
  const selected = Number(document.getElementById("input_selected").value);
  legacygl.begin(gl.LINES);
  linkages.forEach(function (linkage, index) {
    if (index == selected)
      legacygl.color(1, 0, 0);
    else
      legacygl.color(0, 0, 0);
    if (index == 0)
      legacygl.vertex(0, 0, 0);
    else
      legacygl.vertex2(linkages[index - 1].position);
    legacygl.vertex2(linkage.position);
  });
  legacygl.end();
  legacygl.begin(gl.POINTS);
  legacygl.color(0, 0, 0);
  legacygl.vertex(0, 0, 0);
  linkages.forEach(function (linkage, index) {
    if (index == selected)
      legacygl.color(1, 0, 0);
    else
      legacygl.color(0, 0, 0);
    legacygl.vertex2(linkage.position);
  });
  legacygl.end();
};

function init() {
  // OpenGL context
  canvas = document.getElementById("canvas");
  gl = canvas.getContext("experimental-webgl");
  if (!gl)
    alert("Could not initialise WebGL, sorry :-(");
  const vertex_shader_src = "\
    attribute vec3 a_vertex;\
    attribute vec3 a_color;\
    varying vec3 v_color;\
    uniform mat4 u_modelview;\
    uniform mat4 u_projection;\
    void main(void) {\
      gl_Position = u_projection * u_modelview * vec4(a_vertex, 1.0);\
      v_color = a_color;\
      gl_PointSize = 5.0;\
    }\
    ";
  const fragment_shader_src = "\
    precision mediump float;\
    varying vec3 v_color;\
    void main(void) {\
      gl_FragColor = vec4(v_color, 1.0);\
    }\
    ";
  legacygl = get_legacygl(gl, vertex_shader_src, fragment_shader_src);
  legacygl.add_uniform("modelview", "Matrix4f");
  legacygl.add_uniform("projection", "Matrix4f");
  legacygl.add_vertex_attribute("color", 3);
  legacygl.vertex2 = function (p) {
    this.vertex(p[0], p[1], 0);
  };
  drawutil = get_drawutil(gl, legacygl);
  camera = get_camera(canvas.width);
  camera.center = [2, 0, 0];
  camera.eye = [2, 0, 7];
  update_position();

  // イベントハンドラを定義する
  canvas.onmousedown = function (evt) {
    const mouse_win = this.get_mousepos(evt);

    if (document.getElementById("input_ikmode").checked) {
      is_dragging = true;
    }
  };
  canvas.onmousemove = function (evt) {
    // IKモードでドラッグしていない場合は何もせず処理を終える
    if (!is_dragging) return;

    const mouse_win = this.get_mousepos(evt);
    mouse_win.push(1); // 3次元の座標とみなすために仮のz座標値を追加

    // 3次元の場合のソースコードを再利用して、同様の処理を実行する
    const viewport = [0, 0, canvas.width, canvas.height];
    const mouse_obj = glu.unproject(mouse_win,
      legacygl.uniforms.modelview.value,
      legacygl.uniforms.projection.value,
      viewport);
    const plane_origin = [0, 0, 0];
    const plane_normal = [0, 0, 1];
    const eye_to_mouse = vec3.sub([], mouse_obj, camera.eye);
    const eye_to_origin = vec3.sub([], plane_origin, camera.eye);
    const s1 = vec3.dot(eye_to_mouse, plane_normal);
    const s2 = vec3.dot(eye_to_origin, plane_normal);
    const eye_to_intersection = vec3.scale([], eye_to_mouse, s2 / s1);
    const target_position = vec3.add([], camera.eye, eye_to_intersection);

    // マウスの2次元座標（ワールド座標系）を入力としてIKを計算する
    compute_ik([target_position[0], target_position[1]]);

    // IKを計算した結果を表示する
    draw();

    document.getElementById("input_selected").onchange();
  }
  document.onmouseup = function (evt) {
    is_dragging = false;
  };
  document.getElementById("input_selected").max = linkages.length - 1;
  document.getElementById("input_selected").onchange = function () {
    document.getElementById("input_angle").value = linkages[this.value].angle;
    draw();
  };
  document.getElementById("input_angle").onchange = function () {
    const selected = document.getElementById("input_selected").value;
    linkages[selected].angle = Number(document.getElementById("input_angle").value);
    update_position();
    draw();
  };

  // OpenGLの初期設定を行う
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(1, 1, 1, 1);
};