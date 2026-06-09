export function createRandomPool(size = 4096) {
  const values = new Float32Array(size)
  let index = values.length

  function refill() {
    for (let i = 0; i < values.length; i++) {
      values[i] = Math.random()
    }

    index = 0
  }

  return function random() {
    if (index >= values.length) {
      refill()
    }

    return values[index++]!
  }
}
