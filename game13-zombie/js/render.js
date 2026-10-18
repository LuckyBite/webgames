// Рендер и три графических стиля (переключаются в настройках на лету):
//  low  — мрачный low-poly: полное разрешение, мягкие тени, гладкие текстуры
//  hyb  — гибрид: рендер ~400 px по высоте, лёгкий дизеринг, тени остаются
//  ps1  — PS1-ретро: 240 px по высоте, дрожание вершин, 12 уровней цвета, без теней
// Модели одни и те же, меняется только способ рисования.
import * as THREE from 'three';

// v2.1: пост-проход (виньетка, зерно, цвет, ранение) есть во всех стилях. PS1 мягче: 300 px по высоте,
// дрожание вершин на 1 пиксель и без дрожания вблизи камеры (большие полигоны у носа «плыли»).
export const STYLES = {
  low: { name: 'Чёткий', height: 0, post: true, levels: 0, dither: 0, snap: 0, shadows: true, nearest: false, fogMul: 1.0, grain: 0.035 },
  hyb: { name: 'Гибрид', height: 420, post: true, levels: 32, dither: 0.6, snap: 0, shadows: true, nearest: true, fogMul: 1.15, grain: 0.03 },
  ps1: { name: 'PS1-ретро', height: 300, post: true, levels: 22, dither: 0.7, snap: 1.0, shadows: false, nearest: true, fogMul: 1.4, grain: 0.02 },
};

// общая униформа дрожания вершин: x,y = размер сетки привязки в NDC (0 = выкл)
export const SNAP = { value: new THREE.Vector2(0, 0) };

// Подмешивает привязку вершин к сетке в любой стандартный материал.
// Вызывать для всех материалов мира (assets.js делает это при загрузке).
export function patchMaterial(m) {
  if (!m || m.userData.snapPatched) return m;
  m.userData.snapPatched = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => {
    if (prev) prev(s, r);
    s.uniforms.uSnap = SNAP;
    s.vertexShader = 'uniform vec2 uSnap;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nif(uSnap.x>0.0){vec2 sn0=gl_Position.xy/gl_Position.w;vec2 sn1=floor(sn0*uSnap+0.5)/uSnap;gl_Position.xy=mix(sn0,sn1,smoothstep(4.0,16.0,gl_Position.w))*gl_Position.w;}');
  };
  m.customProgramCacheKey = () => 'snap';
  return m;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.25;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, type: THREE.HalfFloatType });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.NearestFilter;
    this.postMat = new THREE.ShaderMaterial({
      uniforms: { tD: { value: this.rt.texture }, L: { value: 16 }, D: { value: 1 }, vig: { value: 0.5 }, hurt: { value: 0 }, low: { value: 0 },
        blood: { value: 0 }, T: { value: 0 }, grain: { value: 0.03 }, res: { value: new THREE.Vector2(1, 1) }, aspect: { value: 1 } },
      vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `uniform sampler2D tD;uniform float L;uniform float D;uniform float vig;uniform float hurt;uniform float low;uniform float blood;
        uniform float T;uniform float grain;uniform vec2 res;uniform float aspect;varying vec2 v;
        float b2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
        float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}
        void main(){
          vec2 q=v-.5;float r=dot(q*vec2(aspect,1.),q*vec2(aspect,1.))/max(1.,aspect*aspect*.5+.5);
          // разъезд цветов к краям, сильнее при ранении
          float ca=(.0015+hurt*.006)*smoothstep(.02,.35,r);
          vec3 c=vec3(texture2D(tD,v+q*ca).r,texture2D(tD,v).g,texture2D(tD,v-q*ca).b);
          // холодный грейдинг: тени в синеву, света чуть теплее
          float l=dot(c,vec3(.299,.587,.114));
          c=mix(c,c*vec3(.92,.98,1.08),.6*(1.-smoothstep(.0,.5,l)));
          // мало здоровья — мир серее
          c=mix(c,vec3(l),low*.6);
          // виньетка
          c*=1.-vig*smoothstep(.08,.7,r);
          // ранение: красные края и капли крови на экране
          c=mix(c,vec3(c.r*1.2+.18,c.g*.45,c.b*.4),hurt*smoothstep(.05,.35,r));
          float sp=vn(v*vec2(aspect,1.)*9.)*.6+vn(v*vec2(aspect,1.)*23.)*.4;
          float bm=smoothstep(.62,.66,sp*.5+r*1.35-.04)*blood;
          c=mix(c,vec3(.25,.02,.02)+c*.25,bm*.55);
          // зерно плёнки
          c+=(h21(v*res+fract(T*7.3)*91.)-.5)*grain;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          if(L>0.){vec2 p=gl_FragCoord.xy;float b=b2(.5*p)*.25+b2(p);gl_FragColor.rgb=floor(gl_FragColor.rgb*L+mix(.5,b,D))/L;}
        }`,
      depthTest: false, depthWrite: false,
    });
    // при рендере в буфер three.js не делает тонмаппинг и sRGB, это делает пост-проход (чанки выше)
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.styleKey = 'hyb';
    this.style = STYLES.hyb;
    this.textures = new Set();     // текстуры мира, которым меняем фильтрацию
    this.shadowLights = new Set(); // источники, которые отбрасывают тень, когда стиль позволяет
    this.renderScale = 1;          // доп. множитель качества для слабых устройств
    this.w = 1; this.h = 1; this.rw = 1; this.rh = 1;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  trackTexture(t) {
    if (!t || this.textures.has(t)) return;
    this.textures.add(t);
    this._applyFilter(t);
  }
  _applyFilter(t) {
    const n = this.style.nearest;
    t.magFilter = n ? THREE.NearestFilter : THREE.LinearFilter;
    t.minFilter = n ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    t.anisotropy = n ? 1 : 4;
    t.needsUpdate = true;
  }

  setStyle(key) {
    if (!STYLES[key]) key = 'hyb';
    this.styleKey = key;
    this.style = STYLES[key];
    for (const t of this.textures) this._applyFilter(t);
    for (const l of this.shadowLights) l.castShadow = this.style.shadows;
    this.resize(this.w, this.h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    const s = this.style;
    let rh = s.height ? Math.min(s.height, h * this.maxDpr) : h * this.maxDpr;
    rh = Math.max(120, Math.round(rh * this.renderScale));
    const rw = Math.max(160, Math.round(rh * w / h));
    this.rw = rw; this.rh = rh;
    this.gl.setSize(rw, rh, false);
    // в чётком стиле буфер со сглаживанием, в пиксельных — без
    const ms = s.nearest ? 0 : 4;
    if (this.rt.samples !== ms) { this.rt.dispose(); this.rt.samples = ms; }
    this.rt.setSize(rw, rh);
    this.rt.texture.minFilter = this.rt.texture.magFilter = s.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    this.canvas.style.imageRendering = s.nearest ? 'pixelated' : 'auto';
    // дрожание: шаг сетки = 2 пикселя рендера в PS1
    if (s.snap) SNAP.value.set(rw * s.snap * 0.5, rh * s.snap * 0.5);
    else SNAP.value.set(0, 0);
    this.postMat.uniforms.L.value = s.levels;
    this.postMat.uniforms.D.value = s.dither;
    this.postMat.uniforms.grain.value = s.grain || 0;
    this.postMat.uniforms.res.value.set(rw, rh);
    this.postMat.uniforms.aspect.value = rw / rh;
  }

  render(scene, camera) {
    this.postMat.uniforms.T.value = performance.now() / 1000;
    if (this.style.post) {
      this.gl.setRenderTarget(this.rt);
      this.gl.render(scene, camera);
      this.gl.setRenderTarget(null);
      this.gl.render(this.postScene, this.postCam);
    } else {
      // без пост-прохода виньетка и «ранение» рисуются оверлеем в CSS
      this.gl.setRenderTarget(null);
      this.gl.render(scene, camera);
    }
  }
}
