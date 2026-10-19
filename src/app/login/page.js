'use client';

import React, { useState } from 'react';
import './login.css';
import { Shield, Lock, User, RefreshCw, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (response.ok) {
                window.location.href = '/';
            } else {
                setError(data.error || 'Falha na autenticação');
            }
        } catch (err) {
            setError('Erro ao conectar ao servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-highlight"></div>
                <div className="login-header">
                    <div className="login-logo">
                        <Shield size={40} className="logo-icon" />
                    </div>
                    <h1>Gerenciador de IPs</h1>
                    <p>Acesse com suas credenciais do Active Directory</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="input-group">
                        <label htmlFor="username">Usuário</label>
                        <div className="input-wrapper">
                            <User size={18} />
                            <input
                                id="username"
                                type="text"
                                placeholder="Seu Usuário AD"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor="password">Senha</label>
                        <div className="input-wrapper">
                            <Lock size={18} />
                            <input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? (
                            <RefreshCw className="spin" size={20} />
                        ) : (
                            'Entrar no Sistema'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
