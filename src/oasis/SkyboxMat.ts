import { Shader, Engine, Color, Vector3, Texture2D, RenderQueueType, CullMode, BaseMaterial, Vector4, Vector2 } from 'oasis-engine'

interface Config {
  BaseMap: Texture2D
}

Shader.create(
  'BaseSkybox',
  `
  #include <common>
  #include <common_vert>

  varying vec2 v_UV;

  void main(){
    v_UV=vec2(TEXCOORD_0.x,1.0-TEXCOORD_0.y) * vec2(1.0,0.5) + vec2(0.0,0.);
    // v_UV=vec2(TEXCOORD_0.x,1.0-TEXCOORD_0.y);

    vec4 position=vec4(POSITION,1.);
    vec4 posClip = u_MVPMat*position;

    // 防止被裁，把 z 挪到远平面内
    posClip.z = posClip.w * 0.999999;

    gl_Position=posClip;
  }
  `,
  `
    uniform sampler2D u_BaseMap;

    varying vec2 v_UV;

    void main() {
      gl_FragColor = texture2D(u_BaseMap, v_UV);
    }
`,
)

export class SkyboxMat extends BaseMaterial {
  constructor(engine: Engine, config: Config) {
    super(engine, Shader.find('BaseSkybox'))

    this.shaderData.setTexture('u_BaseMap', config.BaseMap)

    this.setState()
  }

  setState() {
    const renderState = this.renderState
    // 深度写入
    renderState.depthState.writeEnabled = false
    // 渲染队列
    renderState.renderQueueType = RenderQueueType.AlphaTest
    // 背面剔除
    renderState.rasterState.cullMode = CullMode.Back
  }
}
