export function createStyleSetter<Name extends string>(style: CSSStyleDeclaration) {
  const values: Partial<Record<Name, string>> = {}
  const writable = style as unknown as Record<string, string>

  return (name: Name, value: string) => {
    if (values[name] !== value) {
      values[name] = value
      writable[name] = value
    }
  }
}
