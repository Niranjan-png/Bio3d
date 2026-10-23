import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
    title: "BioPilot 3D Lab",
    description: "A scientific workspace for molecular exploration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
