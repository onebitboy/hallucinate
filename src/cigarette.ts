// One slow puffing cycle: the cigarette rests in the hand, rises to the mouth
// for a drag, holds, lowers again, then the smoker exhales a plume.
const period = 6
const liftStart = 1
const liftEnd = 1.7
const holdEnd = 2.9
const lowerEnd = 3.6
const exhaleEnd = 4.8

export function cigarettePhase(time: number) {
  return ((time % period) + period) % period
}

// 0 = cigarette resting at the hand, 1 = held at the mouth.
export function cigaretteLift(time: number) {
  const t = cigarettePhase(time)

  if (t < liftStart) {
    return 0
  }
  if (t < liftEnd) {
    return smoothstep((t - liftStart) / (liftEnd - liftStart))
  }
  if (t < holdEnd) {
    return 1
  }
  if (t < lowerEnd) {
    return 1 - smoothstep((t - holdEnd) / (lowerEnd - holdEnd))
  }

  return 0
}

// 0 outside the exhale window, rising to 1 at the peak of the plume.
export function cigaretteExhale(time: number) {
  const t = cigarettePhase(time)

  if (t < lowerEnd || t > exhaleEnd) {
    return 0
  }

  return Math.sin((t - lowerEnd) / (exhaleEnd - lowerEnd) * Math.PI)
}

function smoothstep(x: number) {
  return x * x * (3 - 2 * x)
}
