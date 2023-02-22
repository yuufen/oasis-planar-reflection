import { Shader, Engine, Color, Vector3, Texture2D, RenderQueueType, CullMode, BaseMaterial, Vector4, Vector2 } from 'oasis-engine'

Shader.create(
  'PlaneReflectionPlaneShader',
  `
  #include <common>
  #include <common_vert>

  varying vec2 v_UV;
  varying vec4 v_Pos;

  void main(){
    v_UV=TEXCOORD_0;

    vec4 position=vec4(POSITION,1.);

    gl_Position=u_MVPMat*position;
    v_Pos = gl_Position;
  }
  `,
  `
    uniform sampler2D _ReflectionTex;

    varying vec2 v_UV;
    varying vec4 v_Pos;

    void main() {
      vec2 screenUV=v_Pos.xy/v_Pos.w;
      screenUV = (screenUV+1.0)/2.0;
      screenUV.y = 1. - screenUV.y;

      gl_FragColor = vec4(texture2D(_ReflectionTex, screenUV).rgb * vec3(0.75,0.9,0.85), 1.);
    }
`,
)

export class PlaneMat extends BaseMaterial {
  constructor(engine: Engine) {
    super(engine, Shader.find('PlaneReflectionPlaneShader'))

    this.setState()
  }

  setState() {
    const renderState = this.renderState
    // 渲染队列
    renderState.renderQueueType = RenderQueueType.Opaque
    // 背面剔除
    renderState.rasterState.cullMode = CullMode.Back
    renderState.depthState.writeEnabled = true
  }
}
