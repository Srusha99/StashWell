import type { CSSProperties } from "react"

export interface ColorBendsProps {
  className?: string
  style?: CSSProperties
  rotation?: number
  speed?: number
  colors?: string[]
  transparent?: boolean
  autoRotate?: number
  scale?: number
  frequency?: number
  warpStrength?: number
  mouseInfluence?: number
  parallax?: number
  noise?: number
  iterations?: number
  intensity?: number
  bandWidth?: number
}

declare function ColorBends(props: ColorBendsProps): JSX.Element

export default ColorBends
