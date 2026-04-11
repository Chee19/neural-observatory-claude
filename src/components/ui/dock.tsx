import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

const DOCK_SIZE = 128;
const DEFAULT_MAGNIFICATION = 80;
const DEFAULT_DISTANCE = 150;
const DEFAULT_PANEL_SIZE = 64;

type TDockOrientation = 'horizontal' | 'vertical';

type TDockProps = {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  panelSize?: number;
  magnification?: number;
  spring?: SpringOptions;
  orientation?: TDockOrientation;
};

type TDockItemProps = {
  className?: string;
  children: React.ReactNode;
};

type TDockLabelProps = {
  className?: string;
  children: React.ReactNode;
};

type TDockIconProps = {
  className?: string;
  children: React.ReactNode;
};

type TDockContextType = {
  mouse: MotionValue<number>;
  spring: SpringOptions;
  magnification: number;
  distance: number;
  orientation: TDockOrientation;
};

type TDockProviderProps = {
  children: React.ReactNode;
  value: TDockContextType;
};

const DockContext = createContext<TDockContextType | undefined>(undefined);

function DockProvider({ children, value }: TDockProviderProps) {
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

function useDock() {
  const context = useContext(DockContext);
  if (!context) {
    throw new Error('useDock must be used within a DockProvider');
  }
  return context;
}

function Dock({
  children,
  className,
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelSize = DEFAULT_PANEL_SIZE,
  orientation = 'horizontal',
}: TDockProps) {
  const mouse = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxSize = useMemo(() => {
    return Math.max(DOCK_SIZE, magnification + magnification / 2 + 4);
  }, [magnification]);

  const panelAxisSize = useTransform(isHovered, [0, 1], [panelSize, maxSize]);
  const panelSpringSize = useSpring(panelAxisSize, spring);

  const isVertical = orientation === 'vertical';

  return (
    <motion.div
      style={{
        width: isVertical ? panelSpringSize : '100%',
        height: isVertical ? '100%' : panelSpringSize,
        scrollbarWidth: 'none',
      }}
        className={cn(
          isVertical
            ? 'my-2 flex max-h-full items-center overflow-visible'
            : 'mx-2 flex max-w-full items-end overflow-x-auto',
        )}
    >
      <motion.div
        onMouseMove={({ clientX, clientY }) => {
          isHovered.set(1);
          mouse.set(isVertical ? clientY : clientX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouse.set(Infinity);
        }}
        className={cn(
          isVertical
            ? 'ml-0 mr-auto flex h-fit flex-col gap-4 rounded-2xl bg-gray-50 px-3 py-4 dark:bg-neutral-900'
            : 'mx-auto flex w-fit gap-4 rounded-2xl bg-gray-50 px-4 dark:bg-neutral-900',
          className,
        )}
        style={isVertical ? { width: panelSize } : { height: panelSize }}
        role="toolbar"
        aria-label="Application dock"
      >
        <DockProvider value={{ mouse, spring, distance, magnification, orientation }}>
          {children}
        </DockProvider>
      </motion.div>
    </motion.div>
  );
}

function DockItem({ children, className }: TDockItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { distance, magnification, mouse, spring, orientation } = useDock();
  const isHovered = useMotionValue(0);
  const isVertical = orientation === 'vertical';

  const mouseDistance = useTransform(mouse, (val) => {
    const domRect = ref.current?.getBoundingClientRect() ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    if (isVertical) return val - domRect.y - domRect.height / 2;
    return val - domRect.x - domRect.width / 2;
  });

  const sizeTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [40, magnification, 40],
  );

  const size = useSpring(sizeTransform, spring);

  return (
    <motion.div
      ref={ref}
      style={{ width: size, height: size }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      tabIndex={0}
      role="button"
      aria-haspopup="true"
    >
      {Children.map(children, (child) =>
        cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          size,
          isHovered,
          orientation,
        } as Record<string, unknown>),
      )}
    </motion.div>
  );
}

function DockLabel({ children, className, ...rest }: TDockLabelProps) {
  const restProps = rest as Record<string, unknown>;
  const isHovered = restProps['isHovered'] as MotionValue<number>;
  const orientation = (restProps['orientation'] as TDockOrientation | undefined) ?? 'horizontal';
  const [isVisible, setIsVisible] = useState(false);
  const isVertical = orientation === 'vertical';

  useEffect(() => {
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });
    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: isVertical ? -4 : 0, y: isVertical ? 0 : 0 }}
          animate={{ opacity: 1, x: isVertical ? 8 : 0, y: isVertical ? 0 : -10 }}
          exit={{ opacity: 0, x: isVertical ? -4 : 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            isVertical
              ? 'absolute left-full top-1/2 z-[140] ml-2 w-fit -translate-y-1/2 whitespace-pre rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-neutral-700 shadow-lg dark:border-neutral-900 dark:bg-neutral-800 dark:text-white'
              : 'absolute -top-6 left-1/2 z-[140] w-fit whitespace-pre rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-neutral-700 shadow-lg dark:border-neutral-900 dark:bg-neutral-800 dark:text-white',
            className,
          )}
          role="tooltip"
          style={isVertical ? undefined : { x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className, ...rest }: TDockIconProps) {
  const restProps = rest as Record<string, unknown>;
  const size =
    (restProps['size'] as MotionValue<number> | undefined)
    ?? (restProps['width'] as MotionValue<number>);
  const iconSize = useTransform(size, (val) => val / 2);

  return (
    <motion.div
      style={{ width: iconSize, height: iconSize }}
      className={cn('flex items-center justify-center', className)}
    >
      {children}
    </motion.div>
  );
}

export { Dock, DockIcon, DockItem, DockLabel };
