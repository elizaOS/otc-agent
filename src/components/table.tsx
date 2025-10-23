import * as Headless from "@headlessui/react";
import clsx from "clsx";
import type React from "react";

export function Table({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className="flow-root">
      <div
        {...props}
        className={clsx(
          className,
          "-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8",
        )}
      />
    </div>
  );
}

export function TableWrapper({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        "inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8",
      )}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        "text-left text-sm/6 font-normal text-[#7D7D7D] dark:text-[#7D7D7D]",
      )}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        "divide-y divide-zinc-950/5 dark:divide-white/5",
      )}
    />
  );
}

export function TableRow({
  className,
  ...props
}: { className?: string } & Omit<Headless.FieldProps, "className">) {
  return (
    <Headless.Field
      {...props}
      className={clsx(
        className,
        "flex min-w-full items-center gap-x-8 px-4 sm:px-6 lg:px-8",
      )}
    />
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div {...props} className={clsx(className, "flex-1 py-4 pr-8 last:pr-0")} />
  );
}

export function TableCell({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        "flex-1 py-4 pr-8 last:pr-0 text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white",
      )}
    />
  );
}

export function TableActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        "flex flex-none items-center gap-x-4 justify-end py-4 pl-8",
      )}
    />
  );
}
