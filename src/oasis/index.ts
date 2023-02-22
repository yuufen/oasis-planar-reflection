// TODO 有延迟，是 onUpdate 的问题。需要改到 beginCameraRendering，获取所有反射平面，循环。或者改管线，参考 OnWillRenderObject。
import {
  Camera,
  MeshRenderer,
  Vector3,
  WebGLEngine,
  Logger,
  ColorSpace,
  PrimitiveMesh,
  RenderFace,
  AmbientLight,
  AssetType,
  SkyBoxMaterial,
  BackgroundMode,
  PBRMaterial,
} from 'oasis-engine'
import { OrbitControl } from '@oasis-engine-toolkit/controls'
import { Stats } from 'oasis-engine-toolkit'
import { PlaneMat } from './PlaneMat'
import { PlanarReflectionScript } from './PlanarReflectionScript'

export async function initScene() {
  Logger.enable()

  const engine = new WebGLEngine('canvas')
  engine.canvas.resizeByClientSize()
  engine.settings.colorSpace = ColorSpace.Gamma

  const ambientLight = await engine.resourceManager.load<AmbientLight>({
    type: AssetType.Env,
    url: 'https://gw.alipayobjects.com/os/bmw-prod/6470ea5e-094b-4a77-a05f-4945bf81e318.bin',
  })
  const scene = engine.sceneManager.activeScene
  const sky = scene.background.sky
  const skyMaterial = new SkyBoxMaterial(engine)
  scene.background.mode = BackgroundMode.Sky
  sky.material = skyMaterial
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1)

  scene.ambientLight = ambientLight
  skyMaterial.textureCubeMap = ambientLight.specularTexture
  skyMaterial.textureDecodeRGBM = true

  const rootEntity = scene.createRootEntity()

  // 初始化相机
  const cameraEntity = rootEntity.createChild('camera')
  const c = cameraEntity.addComponent(Camera)
  cameraEntity.transform.setPosition(0, 1, 6)
  cameraEntity.transform.setRotation(-10, 10, 0)
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0)
  c.farClipPlane = 1000
  cameraEntity.addComponent(Stats)

  // 初始化场景
  const cubeEntity = rootEntity.createChild('cube')
  const cubeMeshRenderer = cubeEntity.addComponent(MeshRenderer)
  const cubeMesh = PrimitiveMesh.createCuboid(engine)
  cubeMeshRenderer.mesh = cubeMesh
  cubeEntity.transform.setScale(2, 2, 2)
  cubeEntity.transform.setPosition(0, 1.3, 0)
  const mat = new PBRMaterial(engine)
  mat.roughness = 0
  mat.metallic = 1
  // todo 设置反射相机的 cull face 相反，就不用双面了
  mat.renderFace = RenderFace.Double
  cubeMeshRenderer.setMaterial(mat)

  // 物体
  const planeEntity = rootEntity.createChild('plane')
  const planeMesh = PrimitiveMesh.createPlane(engine)
  const planeMeshRenderer = planeEntity.addComponent(MeshRenderer)
  planeMeshRenderer.mesh = planeMesh
  planeEntity.transform.setScale(1000, 1, 1000)
  // planeEntity.transform.setRotation(90, 0, 0)
  const m = new PlaneMat(engine)
  planeMeshRenderer.setMaterial(m)

  // 添加脚本
  planeEntity.addComponent(PlanarReflectionScript)

  engine.run()
}
