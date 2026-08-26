import {
  protectMathExpressions,
  restoreMathExpressions
} from '@/components/MachineTrans/engine'

describe('machine translation math protection', () => {
  it('round-trips inline LaTeX exactly', () => {
    const source = 'The value $f(x)=u(x)v(x)$ is the integrand.'
    const protectedText = protectMathExpressions(source)
    expect(protectedText).not.toContain('$f(x)=u(x)v(x)$')
    expect(restoreMathExpressions(protectedText)).toBe(source)
  })

  it('round-trips unicode formulas exactly', () => {
    const source = 'A vector x ∈ ℝⁿ can be treated as a function.'
    expect(restoreMathExpressions(protectMathExpressions(source))).toBe(source)
  })

  it('restores tokens even if a translator changes their case and separators', () => {
    const source = 'If u = sin(x), the function is odd.'
    const changed = protectMathExpressions(source).replace(
      /SALADICTMATH_[0-9a-f]+_ENDMATH/i,
      token =>
        token
          .toLowerCase()
          .replace('saladictmath_', 'saladictmath-')
          .replace('_endmath', '-endmath')
    )
    expect(restoreMathExpressions(changed)).toBe(source)
  })
})
