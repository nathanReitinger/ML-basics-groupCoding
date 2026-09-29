/* ------------------------------------------------------------------
   A confetti burst for when a student gets everything passing. No
   library: a canvas, a few hundred bits of paper, and gravity.
   ------------------------------------------------------------------ */

window.confetti = function (options) {
  options = options || {};

  var reduced = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  var canvas = document.getElementById("confetti-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
  }

  // No 2d context means no confetti, and that is fine - this is
  // decoration. It must never take a working program down with it.
  var ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    return;
  }
  var dpr = window.devicePixelRatio || 1;

  function size() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();

  var COLOURS = ["#c2402d", "#2f6b45", "#e8b04b", "#3d6ea8", "#8d5bab", "#d8734a"];
  var pieces = [];
  var count = options.count || 160;
  var width = window.innerWidth;
  var height = window.innerHeight;

  // two bursts, one from each bottom corner, arcing inwards
  for (var i = 0; i < count; i++) {
    var fromLeft = i % 2 === 0;
    var angle = (fromLeft ? -60 : -120) + (Math.random() * 40 - 20);
    var speed = 12 + Math.random() * 14;
    pieces.push({
      x: fromLeft ? width * 0.12 : width * 0.88,
      y: height * 0.92,
      vx: Math.cos(angle * Math.PI / 180) * speed,
      vy: Math.sin(angle * Math.PI / 180) * speed,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 7,
      spin: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI,
      colour: COLOURS[i % COLOURS.length],
      life: 1
    });
  }

  var started = null;

  function frame(now) {
    if (started === null) started = now;
    var age = (now - started) / 1000;

    ctx.clearRect(0, 0, width, height);
    var alive = 0;

    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      p.vy += 0.42;            // gravity
      p.vx *= 0.995;           // a little drag
      p.x += p.vx;
      p.y += p.vy;
      p.tilt += p.spin;
      p.life = Math.max(0, 1 - age / 3.2);

      if (p.y < height + 40 && p.life > 0) {
        alive++;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.tilt);
        ctx.fillStyle = p.colour;
        // flip the paper as it spins, so it reads as a flat scrap
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.tilt)));
        ctx.restore();
      }
    }

    if (alive > 0) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, width, height);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  }

  requestAnimationFrame(frame);
};
