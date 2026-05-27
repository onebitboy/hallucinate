import type { Vec3 } from './types.ts'

export const characterBones: [string, string][] = [
  ['mixamorig:Hips', 'mixamorig:Spine'],
  ['mixamorig:Spine', 'mixamorig:Spine1'],
  ['mixamorig:Spine1', 'mixamorig:Spine2'],
  ['mixamorig:Spine2', 'mixamorig:Neck'],
  ['mixamorig:Neck', 'mixamorig:Head'],
  ['mixamorig:Head', 'mixamorig:HeadTop_End'],
  ['mixamorig:Spine2', 'mixamorig:LeftShoulder'],
  ['mixamorig:LeftShoulder', 'mixamorig:LeftArm'],
  ['mixamorig:LeftArm', 'mixamorig:LeftForeArm'],
  ['mixamorig:LeftForeArm', 'mixamorig:LeftHand'],
  ['mixamorig:Spine2', 'mixamorig:RightShoulder'],
  ['mixamorig:RightShoulder', 'mixamorig:RightArm'],
  ['mixamorig:RightArm', 'mixamorig:RightForeArm'],
  ['mixamorig:RightForeArm', 'mixamorig:RightHand'],
  ['mixamorig:Hips', 'mixamorig:LeftUpLeg'],
  ['mixamorig:LeftUpLeg', 'mixamorig:LeftLeg'],
  ['mixamorig:LeftLeg', 'mixamorig:LeftFoot'],
  ['mixamorig:LeftFoot', 'mixamorig:LeftToeBase'],
  ['mixamorig:LeftToeBase', 'mixamorig:LeftToe_End'],
  ['mixamorig:Hips', 'mixamorig:RightUpLeg'],
  ['mixamorig:RightUpLeg', 'mixamorig:RightLeg'],
  ['mixamorig:RightLeg', 'mixamorig:RightFoot'],
  ['mixamorig:RightFoot', 'mixamorig:RightToeBase'],
  ['mixamorig:RightToeBase', 'mixamorig:RightToe_End'],
]

export const characterGroundJoints = [
  'mixamorig:LeftFoot',
  'mixamorig:LeftToeBase',
  'mixamorig:LeftToe_End',
  'mixamorig:RightFoot',
  'mixamorig:RightToeBase',
  'mixamorig:RightToe_End',
]
export const characterScale = 0.007
export const characterFloor = -1.95
export const shirt: Vec3 = [0.035, 0.04, 0.052]
export const shirtLight: Vec3 = [0.055, 0.07, 0.09]
export const pants: Vec3 = [0.035, 0.04, 0.052]
export const skin: Vec3 = [0.86, 0.58, 0.38]
export const shoe: Vec3 = [0.018, 0.018, 0.02]
export const jewelPalette: Vec3[] = [
  [0.018, 0.018, 0.02],
  [0.14, 0.145, 0.16],
  [0.78, 0.76, 0.72],
  [0.8, 0.03, 0.12],
  [0.05, 0.52, 0.9],
  [0.02, 0.72, 0.42],
  [0.72, 0.08, 0.92],
  [0.98, 0.72, 0.05],
  [0.0, 0.82, 0.82],
]
export const hairPalette: Vec3[] = [
  [0.025, 0.018, 0.014],
  [0.18, 0.09, 0.035],
  [0.78, 0.62, 0.34],
  [0.62, 0.12, 0.035],
  [0.86, 0.84, 0.78],
  ...jewelPalette.slice(3),
]
