// TODO 有延迟，是 onUpdate 的问题。需要改到 beginCameraRendering，获取所有反射平面，循环。或者改管线，参考 OnWillRenderObject。
import {
  Camera,
  MeshRenderer,
  Vector3,
  WebGLEngine,
  GLTFResource,
  Script,
  Logger,
  Color,
  Texture2D,
  Vector4,
  Vector2,
  ColorSpace,
  PBRMaterial,
  RenderQueueType,
  RenderTarget,
  TextureWrapMode,
  Entity,
  CameraClearFlags,
  TextureFormat,
  TextureDepthCompareFunction,
  WebGLMode,
  PrimitiveMesh,
  BlinnPhongMaterial,
  DirectLight,
  UnlitMaterial,
  Material,
  BaseMaterial,
  Engine,
  Matrix,
  Matrix3x3,
  RenderFace,
} from 'oasis-engine'
import { OrbitControl } from '@oasis-engine-toolkit/controls'
import { Stats } from 'oasis-engine-toolkit'
import { SkyboxMat } from './SkyboxMat'
import { PlaneMat } from './PlaneMat'
import { TestMat } from './TestMat'

let rootEntity: Entity
let engine: WebGLEngine
let destEntity: Entity
let sharedMaterial: BaseMaterial

let cubeEntity: Entity

let mm

const reflectionTexName = '_ReflectionTex'

export async function initScene() {
  Logger.enable()

  engine = new WebGLEngine('canvas', {
    // webGLMode: WebGLMode.WebGL1,
  })
  engine.canvas.resizeByClientSize()
  engine.settings.colorSpace = ColorSpace.Gamma

  const scene = engine.sceneManager.activeScene
  scene.background.solidColor.set(0, 0, 0, 1)
  rootEntity = scene.createRootEntity()

  // 初始化相机
  const cameraEntity = rootEntity.createChild('camera')
  const c = cameraEntity.addComponent(Camera)
  cameraEntity.transform.setPosition(0, 1, 6)
  cameraEntity.transform.setRotation(-10, 10, 0)
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0)
  cameraEntity.addComponent(Stats)

  // 初始化场景
  {
    // 光源
    const lightEntity = rootEntity.createChild('light')
    const directLight = lightEntity.addComponent(DirectLight)
    directLight.color.set(1, 0.5, 0.3, 1)
    directLight.intensity = 0.6
    lightEntity.transform.setRotation(-10, -180, 0)

    cubeEntity = rootEntity.createChild('cube')
    const cubeMeshRenderer = cubeEntity.addComponent(MeshRenderer)
    const cubeMesh = PrimitiveMesh.createCuboid(engine)
    cubeMeshRenderer.mesh = cubeMesh
    cubeEntity.transform.setPosition(0, 0.6, 1)
    const mat = new UnlitMaterial(engine)
    // todo 设置反射相机的 cull face 相反，就不用双面了
    mat.renderFace = RenderFace.Double
    cubeMeshRenderer.setMaterial(mat)

    // skybox
    const [Skybox_GLTF, Sky_Base] = (await engine.resourceManager.load([
      'https://gw.alipayobjects.com/os/H5App-BJ/1672318832442-skybox-gltf/SM_SkySphere.gltf',
      'https://mdn.alipayobjects.com/afts/img/A*9q2DSo5boQkAAAAAAAAAAAAADrd2AQ/PaintedSky_Dawn_Aurora1.jpg',
    ])) as [GLTFResource, Texture2D]
    const skybox = Skybox_GLTF.defaultSceneRoot
    rootEntity.addChild(skybox)
    skybox.transform.setScale(400, 400, 400)
    skybox.transform.setPosition(0, -750, 0)
    const mesh = skybox.getComponent(MeshRenderer)
    mesh.setMaterial(
      new SkyboxMat(engine, {
        BaseMap: Sky_Base,
      }),
    )
  }

  // 物体
  const planeEntity = rootEntity.createChild('plane')
  const planeMesh = PrimitiveMesh.createPlane(engine)
  const planeMeshRenderer = planeEntity.addComponent(MeshRenderer)
  planeMeshRenderer.mesh = planeMesh
  planeEntity.transform.setScale(3500, 1, 3500)
  // planeEntity.transform.setRotation(90, 0, 0)
  const m = new PlaneMat(engine)
  planeMeshRenderer.setMaterial(m)
  destEntity = planeEntity
  sharedMaterial = m

  // 添加脚本
  planeEntity.addComponent(PlanarReflectionScript)

  {
    const planeEntity = rootEntity.createChild('plane')
    const planeMesh = PrimitiveMesh.createPlane(engine)
    const planeMeshRenderer = planeEntity.addComponent(MeshRenderer)
    planeMeshRenderer.mesh = planeMesh
    planeEntity.transform.setPosition(1, 0.6, -0.5)
    planeEntity.transform.setScale(1, 1, 1)
    planeEntity.transform.setRotation(90, 0, 0)
    mm = new TestMat(engine)
    planeMeshRenderer.setMaterial(mm)
  }

  engine.run()
}

class PlanarReflectionScript extends Script {
  // 降采样参数
  downsample: number = 1
  // 反射图偏移数值
  // clipPlaneOffset = 0.07
  clipPlaneOffset = 0
  // clipPlaneOffset = 0
  // 当前主相机
  _currentCam: Camera
  // 平面反射相机
  _reflectionCamera: Camera

  // 画布宽高
  _width: number
  _height: number

  //用来判断当前是否正在渲染反射图，防止时序问题
  _insideRendering: boolean

  onAwake() {
    const engine = this.engine
    const { width, height } = engine.canvas
    this._width = width
    this._height = height

    // @ts-ignore
    sharedMaterial = destEntity.getComponent(MeshRenderer).getMaterial()
    // @ts-ignore
    this._currentCam = this.engine.sceneManager.activeScene.getRootEntity().findByName('camera').getComponent(Camera)
  }

  onUpdate(): void {
    if (this._currentCam == null || this._insideRendering) {
      return
    }
    this._insideRendering = true

    if (this._reflectionCamera == null) {
      this._reflectionCamera = this.createReflectionCamera(this._currentCam)
    }

    //渲染反射图
    this.renderReflection(this._currentCam, this._reflectionCamera)

    // @ts-ignore
    sharedMaterial.shaderData.setTexture(reflectionTexName, this._reflectionCamera.renderTarget.getColorTexture())
    // @ts-ignore
    mm.shaderData.setTexture(reflectionTexName, this._reflectionCamera.renderTarget.getColorTexture())

    this._insideRendering = false
  }

  //创建反射用的摄像机
  private createReflectionCamera(sourceCam: Camera): Camera {
    //生成Camera
    const reflName = destEntity.name + 'Reflection' + sourceCam.entity.name

    const entity = rootEntity.createChild(reflName)
    const reflectCamera = entity.addComponent(Camera)

    //创建RT并绑定Camera
    if (!reflectCamera.renderTarget) {
      // reflectCamera.renderTarget = null
      reflectCamera.renderTarget = this.createRT(sourceCam)
    }

    return reflectCamera
  }

  //创建RT
  private createRT(sourceCam: Camera): RenderTarget {
    const width = Math.floor(this._width / this.downsample)
    const height = Math.floor(this._height / this.downsample)
    const formatRT = sourceCam.enableHDR ? TextureFormat.R16G16B16A16 : TextureFormat.R8G8B8A8

    const rt = new RenderTarget(this.engine, width, height, new Texture2D(this.engine, width, height, formatRT, false))

    return rt
  }

  //调用反射相机，渲染反射图
  private renderReflection(currentCam: Camera, reflectCamera: Camera): void {
    if (reflectCamera == null || !sharedMaterial) {
      console.error('缺少属性')
      return
    }

    // TODO 获取 gl，修改裁剪面，因为渲染反射时顶点变换后正面会变背面
    // TODO 这个应该是不能放在 OnUpdate 里做的，Oasis 应该需要给反射相机挂个脚本
    // TODO 记得还原

    const reflectiveSurface = destEntity //waterHeight;

    const eulerA = currentCam.entity.transform.rotation

    reflectCamera.entity.transform.rotation = new Vector3(-eulerA.x, eulerA.y, eulerA.z)
    reflectCamera.entity.transform.position = currentCam.entity.transform.position

    const pos = reflectiveSurface.transform.position
    const normal = reflectiveSurface.transform.getWorldUp(new Vector3())
    const distance = -Vector3.dot(normal, pos) - this.clipPlaneOffset
    // 用法线+离原点距离表示反射平面
    const reflectionPlane = new Vector4(normal.x, normal.y, normal.z, distance)

    // console.log(reflectionPlane)

    const reflectionMatrix = this.calculateReflectionMatrix(reflectionPlane)

    // console.log(reflectionMatrix)

    const oldpos = currentCam.entity.transform.position
    const newpos = oldpos.clone()
    newpos.transformToVec3(reflectionMatrix)

    // console.log(oldpos, newpos)

    // TODO 通用方案，上线时删掉
    // TODO v mat 不对
    const reflectCamViewMatrix = currentCam.viewMatrix.clone().multiply(reflectionMatrix)
    const clipPlane = this.cameraSpacePlane(reflectCamViewMatrix, pos, normal, 1.0)

    console.log('bf', JSON.stringify(reflectCamera.viewMatrix))
    // 顶点先经过镜面对称，再进行原相机的摄像机变换
    reflectCamera.entity.transform.worldMatrix = currentCam.viewMatrix.clone().multiply(reflectionMatrix).invert()

    // todo 这一串值还是不对
    console.log('af1', JSON.stringify(reflectCamera.viewMatrix))
    console.log('af2', JSON.stringify(reflectCamera.entity.transform.worldMatrix.clone().invert()))
    console.log('af3', JSON.stringify(currentCam.viewMatrix.clone().multiply(reflectionMatrix)))

    // console.log('1', JSON.stringify(reflectCamera.entity.transform.worldMatrix.clone().invert()))
    // console.log('2', JSON.stringify(reflectCamera.viewMatrix))

    // console.log(clipPlane)

    const projMatrix = this.calculateObliqueMatrix(currentCam.projectionMatrix, clipPlane)
    reflectCamera.projectionMatrix = projMatrix
    //! oasis 要手动调用一下
    reflectCamera.resetProjectionMatrix()

    console.log('3', JSON.stringify(reflectCamera.viewMatrix))

    // console.log(projMatrix)

    // todo 上线时代替通用方案，v mat 不生效，就用这个吧
    {
      reflectCamera.entity.transform.position = newpos
      const euler = currentCam.entity.transform.rotation
      // 垂直的参数
      // reflectCamera.entity.transform.setRotation(180 - euler.x, -euler.y, euler.z)
      // 水平的参数
      reflectCamera.entity.transform.setRotation(-euler.x, euler.y, euler.z)
      // 其他角度
      // ...
    }

    // console.log(newpos)
    // console.log('cur', currentCam.entity.transform.rotation)
    // console.log(reflectCamera.entity.transform.rotation)

    console.log('4', JSON.stringify(reflectCamera.viewMatrix))
  }

  // 根据反射平面计算：反射的变换矩阵
  private calculateReflectionMatrix(plane: Vector4): Matrix {
    const reflectionMat = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)

    // todo 也有可能是这玩意算错了
    reflectionMat.set(
      1.0 - 2.0 * plane.x * plane.x,
      -2.0 * plane.x * plane.y,
      -2.0 * plane.x * plane.z,
      -2.0 * plane.w * plane.x,
      -2.0 * plane.y * plane.x,
      1.0 - 2.0 * plane.y * plane.y,
      -2.0 * plane.y * plane.z,
      -2.0 * plane.w * plane.y,
      -2.0 * plane.z * plane.x,
      -2.0 * plane.z * plane.y,
      1.0 - 2.0 * plane.z * plane.z,
      -2.0 * plane.w * plane.z,
      0,
      0,
      0,
      1,
    )
    return reflectionMat
  }

  // 根据反射平面的 pos 和 normal，计算反射相机的裁剪平面
  private cameraSpacePlane(viewMatrix: Matrix, pos: Vector3, normal: Vector3, sideSign: number): Vector4 {
    pos = pos.clone()
    normal = normal.clone()

    const offsetPos = pos.clone().add(normal.scale(this.clipPlaneOffset))
    const viewMat = viewMatrix
    const posVS = offsetPos.transformToVec3(viewMat)
    const normalVS = normal.transformNormal(viewMat).normalize().scale(sideSign)
    const distance = -Vector3.dot(posVS, normalVS)

    return new Vector4(normalVS.x, normalVS.y, normalVS.z, distance)
  }

  // 构造斜裁剪矩阵
  private calculateObliqueMatrix(projection: Matrix, clipPlane: Vector4): Matrix {
    projection = projection.clone()
    clipPlane = clipPlane.clone()

    const q = new Vector4()
    Vector4.transform(new Vector4(Math.sign(clipPlane.x), Math.sign(clipPlane.y), 1.0, 1.0), projection.invert(), q)

    const c = clipPlane.scale(2.0 / Vector4.dot(clipPlane, q))
    projection.elements[2] = c.x - projection.elements[3]
    projection.elements[6] = c.y - projection.elements[7]
    projection.elements[10] = c.z - projection.elements[11]
    projection.elements[14] = c.w - projection.elements[15]

    return projection
  }
}
