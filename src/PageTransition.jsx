import { motion, useReducedMotion } from 'framer-motion';

void motion;

const closedPolygon =
  'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%)';
const openPolygon =
  'polygon(-15% -15%, 108% 0%, 92% 18%, 120% 38%, 88% 58%, 115% 100%, 0% 118%, 10% 72%, -12% 44%, 8% 16%)';

const overlayTransition = {
  duration: 0.9,
  ease: [0.25, 0.9, 0.3, 1],
};

const PageTransition = ({ children }) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div className="relative min-h-screen w-full overflow-hidden">
      <motion.div
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, filter: 'blur(4px)' }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(4px)' }}
        transition={shouldReduceMotion ? { duration: 0.12 } : { duration: 0.45, delay: 0.14, ease: 'easeOut' }}
      >
        {children}
      </motion.div>

      {!shouldReduceMotion ? (
        <>
          <motion.div
            className="fixed inset-0 z-[10000] pointer-events-none bg-white mix-blend-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0.08, 0] }}
            exit={{ opacity: [0, 0.25, 0.06, 0] }}
            transition={{ duration: 0.26, times: [0, 0.2, 0.5, 1], ease: 'easeOut' }}
          />

          <motion.div
            className="fixed inset-0 z-[9999] pointer-events-none bg-[linear-gradient(135deg,#000_0%,#000_58%,#e4000f_58%,#e4000f_78%,#000_78%,#000_100%)]"
            initial={{ clipPath: closedPolygon, opacity: 1, scale: 0.985 }}
            animate={{ clipPath: openPolygon, opacity: [1, 1, 0.92, 0], scale: [0.985, 1.005, 1, 1] }}
            exit={{ clipPath: closedPolygon, opacity: [0, 0.92, 1, 1], scale: [1, 1.008, 0.992] }}
            transition={overlayTransition}
          />

          <motion.div
            className="fixed inset-0 z-[9998] pointer-events-none bg-white/20 mix-blend-screen"
            initial={{ clipPath: closedPolygon, opacity: 0.28, scale: 0.99 }}
            animate={{ clipPath: openPolygon, opacity: [0.28, 0.22, 0.1, 0], scale: [0.99, 1.004, 1, 1] }}
            exit={{ clipPath: closedPolygon, opacity: [0, 0.1, 0.2, 0.28], scale: [1, 1.006, 0.994] }}
            transition={{ ...overlayTransition, duration: 0.82 }}
          />
        </>
      ) : null}
    </motion.div>
  );
};

export default PageTransition;