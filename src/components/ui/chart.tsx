import * as React from "react"
import * as RechartsPrimitive from "recharts"
import { cn } from "@/lib/utils"

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string; icon?: React.ComponentType }>

type ChartContextProps = { config: ChartConfig }
const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error("useChart must be used within a ChartContainer")
  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"] }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn("flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-gray-400 [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-gray-700/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-gray-600 [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-gray-700/50 [&_.recharts-radial-bar-background-sector]:fill-gray-800 [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-gray-700/20 [&_.recharts-reference-line_[stroke='#ccc']]:stroke-gray-700/50 [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none", className)}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "ChartContainer"

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, cfg]) => cfg.color)
  if (!colorConfig.length) return null
  return (
    <style>{`:root { ${colorConfig.map(([key, cfg]) => `--color-${key}: ${cfg.color}`).join("; ")} } [data-chart=${id}] { ${colorConfig.map(([key, cfg]) => `--color-${key}: ${cfg.color}`).join("; ")} }`}</style>
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

type TooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean
  payload?: Record<string, unknown>[]
  label?: unknown
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: "line" | "dot" | "dashed"
  nameKey?: string
  labelKey?: string
  labelFormatter?: (value: unknown, payload: Record<string, unknown>[]) => React.ReactNode
  formatter?: (value: unknown, name: string, item: unknown, index: number, payload: unknown) => React.ReactNode
  color?: string
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelKey,
      nameKey,
      formatter,
      color,
    },
    ref,
  ) => {
    const { config } = useChart()

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) return null
      const item = payload[0]
      const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
      const itemConfig = getPayloadConfigFromPayload(config, item, key)
      const value =
        !labelKey && typeof label === "string"
          ? (config[label as keyof typeof config]?.label ?? label)
          : itemConfig?.label

      if (labelFormatter) {
        return <div className="font-medium">{labelFormatter(value ?? label, payload)}</div>
      }
      if (!value) return null
      return <div className="font-medium">{value}</div>
    }, [hideLabel, payload, labelKey, label, labelFormatter, config])

    if (!active || !payload?.length) return null

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-gray-700 bg-gray-900/95 px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {tooltipLabel}
        <div className="grid gap-1.5">
          {payload.map((item: Record<string, unknown>, index: number) => {
            const key = `${nameKey ?? (item.name as string) ?? (item.dataKey as string) ?? "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color ?? (item.payload as Record<string, unknown>)?.fill as string ?? item.color as string

            return (
              <div
                key={item.dataKey as string}
                className={cn("flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-gray-400", indicator === "dot" && "items-center")}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name as string, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : !hideIndicator ? (
                      <div
                        className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", indicator === "dot" && "h-2.5 w-2.5 rounded-full", indicator === "line" && "w-1", indicator === "dashed" && "w-0 border-[1.5px] border-dashed bg-transparent")}
                        style={{ "--color-bg": indicatorColor, "--color-border": indicatorColor } as React.CSSProperties}
                      />
                    ) : null}
                    <div className={cn("flex flex-1 justify-between leading-none", hideIndicator ? "items-end" : "items-center")}>
                      <span className="text-gray-400">{itemConfig?.label ?? (item.name as string)}</span>
                      {item.value !== undefined && (
                        <span className="font-mono font-medium tabular-nums text-gray-100">
                          {(item.value as number).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  },
)
ChartTooltipContent.displayName = "ChartTooltipContent"

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) return undefined
  const payloadPayload = "payload" in payload && typeof (payload as Record<string, unknown>).payload === "object" ? (payload as Record<string, unknown>).payload as Record<string, unknown> : undefined
  let configLabelKey: string = key
  if (key in config) {
    configLabelKey = key
  } else if (payloadPayload && key in payloadPayload) {
    const val = payloadPayload[key]
    if (typeof val === "string" && val in config) configLabelKey = val
  }
  return configLabelKey in config ? config[configLabelKey] : undefined
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
