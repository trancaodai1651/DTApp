// Local shadcn/ui-style Button: Radix Slot + CVA, scoped to Office utilities.
import type { ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva,type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants=cva('of-button',{variants:{variant:{default:'of-button-primary',secondary:'of-button-secondary',danger:'of-button-danger'}},defaultVariants:{variant:'default'}});
export function Button({className,variant,asChild=false,...props}:ComponentProps<'button'>&VariantProps<typeof variants>&{asChild?:boolean}) {
 const Component=asChild?Slot:'button';return <Component className={twMerge(clsx(variants({variant}),className))} {...props}/>;
}
