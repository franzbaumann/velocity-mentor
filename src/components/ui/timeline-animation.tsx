 "use client";

 import * as React from "react";
 import { motion, type Variants } from "framer-motion";
 import { cn } from "@/lib/utils";

 interface TimelineContentBaseProps {
   animationNum: number;
   timelineRef?: React.RefObject<HTMLElement | null>;
   customVariants: Variants & {
     visible: (i: number) => any;
     hidden: any;
   };
   className?: string;
   children: React.ReactNode;
 }

 type AsProp =
   | keyof JSX.IntrinsicElements
   | React.ComponentType<Record<string, any>>;

 interface TimelineContentProps
   extends TimelineContentBaseProps,
     Omit<React.HTMLAttributes<HTMLElement>, "children"> {
   as?: AsProp;
 }

 export function TimelineContent({
   as,
   animationNum,
   timelineRef, // currently not used but kept for API compatibility
   customVariants,
   className,
   children,
   ...rest
 }: TimelineContentProps) {
   const Component = (as || "div") as AsProp;
   const MotionComponent = motion(Component as any);

   return (
     <MotionComponent
       className={cn(className)}
       custom={animationNum}
       initial="hidden"
       whileInView="visible"
       viewport={{ once: true, amount: 0.2 }}
       variants={customVariants}
       {...rest}
     >
       {children}
     </MotionComponent>
   );
 }

