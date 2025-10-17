import "@/app/globals.css";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {children}
    </div>
  );
}
