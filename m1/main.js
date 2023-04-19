var gl;
var canvas;
var legacygl;
var drawutil;
var camera;
var control_points;
var selected = null;

function combination(n, i) {
    var ret = 1;
    for (var j = n - i + 1; j <= n; j++) ret *= j;
    for (var j = 1; j <= i; j++) ret /= j;
    return ret;
}

function eval_bezier(t, control_points) {
    if (document.getElementById("input_use_de_casteljau").checked) {
        // de Casteljau's algorithm
        var points = control_points;
        for (var i = 0; i < control_points.length - 1; i++) {
            var new_points = [];
            for (var j = 0; j < points.length - 1; j++) {
                new_points.push(vec2.add(
                    [], 
                    vec2.scale([], points[j], t), 
                    vec2.scale([], points[j + 1], 1 - t)
                ));
            }
            points = new_points;
        }
        return points[0];
    } else {
        var n = control_points.length - 1;
        return control_points.map((p, i) => 
            vec2.scale([], p, combination(n, i) * t ** i * (1 - t) ** (n - i))
        ).reduce((sum, p) => vec2.add(sum, sum, p), [0.0, 0.0]);
    }
}

function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // projection & camera position
    mat4.perspective(legacygl.uniforms.projection.value, Math.PI / 6, canvas.aspect_ratio(), 0.1, 1000);
    var modelview = legacygl.uniforms.modelview;
    camera.lookAt(modelview.value);
    
    // xy grid
    gl.lineWidth(1);
    legacygl.color(0.5, 0.5, 0.5);
    drawutil.xygrid(100);
    
    var numsteps = Number(document.getElementById("input_numsteps").value);
    // draw line segments composing curve
    legacygl.color(1, 0.6, 0.2);
    legacygl.begin(gl.LINE_STRIP);
    for (var i = 0; i <= numsteps; ++i) {
        var t = i / numsteps;
        legacygl.vertex2(eval_bezier(t, control_points));
    }
    legacygl.end();

    // draw sample points
    if (document.getElementById("input_show_samplepoints").checked) {
        legacygl.begin(gl.POINTS);
        for (var i = 0; i <= numsteps; ++i) {
            var t = i / numsteps;
            legacygl.vertex2(eval_bezier(t, control_points));
        }
        legacygl.end();
    }

    // draw control points
    if (document.getElementById("input_show_controlpoints").checked) {
        legacygl.color(0.2, 0.5, 1);
        legacygl.begin(gl.LINE_STRIP);
        control_points.forEach(p => { legacygl.vertex2(p); });
        legacygl.end();
        legacygl.begin(gl.POINTS);
        control_points.forEach(p => { legacygl.vertex2(p); });
        legacygl.end();
    }
};

function init() {
    // OpenGL context
    canvas = document.getElementById("canvas");
    gl = canvas.getContext("experimental-webgl");
    if (!gl)
        alert("Could not initialize WebGL, sorry :-(");
    var vertex_shader_src = "\
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
    var fragment_shader_src = "\
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
    legacygl.vertex2 = function(p) {
        this.vertex(p[0], p[1], 0);
    };
    drawutil = get_drawutil(gl, legacygl);
    camera = get_camera(canvas.width);
    camera.eye = [0, 0, 7];

    control_points = [
        [-0.5, -0.6],
        [1.2, 0.5],
        [-0.4, 1.3]
    ];

    // event handlers
    // Add a new control point on right click
    canvas.oncontextmenu = function(evt) {
        var viewport = [0, 0, canvas.width, canvas.height];
        var mouse_win = this.get_mousepos(evt);
        mouse_win.push(1);
        var mouse_obj = glu.unproject(
            mouse_win,
            legacygl.uniforms.modelview.value,
            legacygl.uniforms.projection.value,
            viewport
        );
        var plane_origin = [0, 0, 0];
        var plane_normal = [0, 0, 1];
        var eye_to_mouse = vec3.sub([], mouse_obj, camera.eye);
        var eye_to_origin = vec3.sub([], plane_origin, camera.eye);
        var s1 = vec3.dot(eye_to_mouse, plane_normal);
        var s2 = vec3.dot(eye_to_origin, plane_normal);
        var eye_to_intersection = vec3.scale([], eye_to_mouse, s2 / s1);
        var new_point = vec3.add([], camera.eye, eye_to_intersection);
        control_points.push(new_point);
        draw();
        return false;
    }
    
    canvas.onmousedown = function(evt) {
        var mouse_win = this.get_mousepos(evt);
        if (evt.altKey) {
            camera.start_moving(mouse_win, evt.shiftKey ? "zoom" : "pan");
            return;
        }
        // pick nearest object
        var viewport = [0, 0, canvas.width, canvas.height];
        var dist_min = 10000000;
        for (var i = 0; i < control_points.length; ++i) {
            var object_win = glu.project([control_points[i][0], control_points[i][1], 0], 
                                         legacygl.uniforms.modelview.value,
                                         legacygl.uniforms.projection.value,
                                         viewport);
            var dist = vec2.dist(mouse_win, object_win);
            if (dist < dist_min) {
                dist_min = dist;
                selected = control_points[i];
            }
        }
    };

    canvas.onmousemove = function(evt) {
        var mouse_win = this.get_mousepos(evt);
        if (camera.is_moving()) {
            camera.move(mouse_win);
            draw();
            return;
        }
        if (selected != null) {
            var viewport = [0, 0, canvas.width, canvas.height];
            mouse_win.push(1);
            var mouse_obj = glu.unproject(mouse_win, 
                                          legacygl.uniforms.modelview.value,
                                          legacygl.uniforms.projection.value,
                                          viewport);
            // just reuse the same code as the 3D case
            var plane_origin = [0, 0, 0];
            var plane_normal = [0, 0, 1];
            var eye_to_mouse = vec3.sub([], mouse_obj, camera.eye);
            var eye_to_origin = vec3.sub([], plane_origin, camera.eye);
            var s1 = vec3.dot(eye_to_mouse, plane_normal);
            var s2 = vec3.dot(eye_to_origin, plane_normal);
            var eye_to_intersection = vec3.scale([], eye_to_mouse, s2 / s1);
            vec3.add(selected, camera.eye, eye_to_intersection);
            draw();
        }
    }
    document.onmouseup = function (evt) {
        if (camera.is_moving()) {
            camera.finish_moving();
            return;
        }
        selected = null;
    };
    // init OpenGL settings
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
};

window.addEventListener('DOMContentLoaded', e => {
    init();
    draw();
});

window.addEventListener('input', e => {
    draw();
});