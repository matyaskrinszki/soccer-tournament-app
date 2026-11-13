import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "./components/AuthContext";
import Header from "./components/Header";
import AuthModal from "./components/AuthModal";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata = {
    title: "Futballbajnokság",
    description: "Soccer tournament application",
};

export default function RootLayout({ children }) {
    return (
        <html lang="hu">
            <body
                className={`${geistSans.variable} ${geistMono.variable}`}
            >
                <AuthProvider>
                    <Header />
                    {children}
                    <AuthModal />
                </AuthProvider>
            </body>
        </html>
    );
}
