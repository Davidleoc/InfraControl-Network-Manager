import './globals.css';

export const metadata = {
    title: 'Gerenciador de IPs e Nomes de Ativos',
    description: 'Sistema de Gerenciamento de IPs e Nomes de Ativos integrado ao Jira CMDB',
};

export default function RootLayout({ children }) {
    return (
        <html lang="pt-br">
            <body>
                <main>{children}</main>
            </body>
        </html>
    );
}
