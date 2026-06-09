import {
  characterGroundJoints,
  pants,
  shirt,
  shirtLight,
  shoe,
  skin,
} from './character-data.ts'
import type { CharacterPart } from './types.ts'

const shoeStart = -0.08
const shoeEnd = 0.78
const lowerLegEnd = 0.9

export const characterParts: CharacterPart[] = [
  { from: 'mixamorig:Hips', to: 'mixamorig:Neck', width: 0.26, depth: 0.16, color: shirtLight, start: -0.06, end: 1.02,
    top: 'torso' },
  { from: 'mixamorig:Neck', to: 'mixamorig:HeadTop_End', width: 0.17, depth: 0.16, color: skin, start: 0.02,
    end: 0.34 },
  { from: 'mixamorig:LeftArm', to: 'mixamorig:LeftForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:LeftForeArm', to: 'mixamorig:LeftHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightArm', to: 'mixamorig:RightForeArm', width: 0.07, depth: 0.065, color: shirt, top: 'sleeve',
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:RightForeArm', to: 'mixamorig:RightHand', width: 0.055, depth: 0.05, color: skin, end: 1.22,
    armOffset: 0.075, lift: 0.035 },
  { from: 'mixamorig:LeftUpLeg', to: 'mixamorig:LeftLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:LeftLeg', to: 'mixamorig:LeftFoot', width: 0.08, depth: 0.07, color: skin, end: lowerLegEnd },
  { from: 'mixamorig:LeftFoot', to: 'mixamorig:LeftToe_End', width: 0.09, depth: 0.05, color: shoe, start: shoeStart,
    end: shoeEnd },
  { from: 'mixamorig:RightUpLeg', to: 'mixamorig:RightLeg', width: 0.1, depth: 0.085, color: pants, bottom: true },
  { from: 'mixamorig:RightLeg', to: 'mixamorig:RightFoot', width: 0.08, depth: 0.07, color: skin, end: lowerLegEnd },
  { from: 'mixamorig:RightFoot', to: 'mixamorig:RightToe_End', width: 0.09, depth: 0.05, color: shoe, start: shoeStart,
    end: shoeEnd },
]

export const characterPoseJoints = [
  ...new Set([
    ...characterGroundJoints,
    ...characterParts.flatMap(part => [part.from, part.to]),
    'mixamorig:Spine2',
    'mixamorig:Neck',
    'mixamorig:Hips',
    'mixamorig:LeftUpLeg',
    'mixamorig:RightUpLeg',
    'mixamorig:LeftLeg',
    'mixamorig:RightLeg',
    'mixamorig:Head',
    'mixamorig:HeadTop_End',
  ]),
]

export const characterPoseJointSet = new Set(characterPoseJoints)
