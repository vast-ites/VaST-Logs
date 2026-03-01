import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import Security from './pages/Security';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';

import Login from './pages/Login';

import { Servers } from './pages/Servers';
import { CpuPage } from './pages/Cpu';
import { MemoryPage } from './pages/Memory';
import { Storage } from './pages/Storage';
import { NetworkPage } from './pages/Network';
import { Alerts } from './pages/Alerts';
import Connections from './pages/Connections';
import IpIntelligence from './pages/IpIntelligence';

import { HostProvider } from './contexts/HostContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  return (token && role === 'admin') ? children : <Navigate to="/" />;
};

function App() {
  return (
    <HostProvider>
      <ThemeProvider>
        <BrowserRouter>
          <NotificationProvider>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
                <Route
                  index
                  element={
                    <PrivateRoute>
                      <Dashboard />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="logs"
                  element={
                    <PrivateRoute>
                      <Logs />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="ip-intelligence"
                  element={
                    <PrivateRoute>
                      <IpIntelligence />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="services"
                  element={
                    <PrivateRoute>
                      <Services />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="services/:serviceName"
                  element={
                    <PrivateRoute>
                      <ServiceDetail />
                    </PrivateRoute>
                  }
                />

                {/* Infrastructure Routes */}
                <Route path="infrastructure">
                  <Route
                    index
                    element={
                      <PrivateRoute>
                        <Servers />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="cpu"
                    element={
                      <PrivateRoute>
                        <CpuPage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="memory"
                    element={
                      <PrivateRoute>
                        <MemoryPage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="storage"
                    element={
                      <PrivateRoute>
                        <Storage />
                      </PrivateRoute>
                    }
                  />
                  <Route
                    path="network"
                    element={
                      <PrivateRoute>
                        <NetworkPage />
                      </PrivateRoute>
                    }
                  />
                </Route>

                <Route
                  path="security"
                  element={
                    <PrivateRoute>
                      <Security />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="alerts"
                  element={
                    <PrivateRoute>
                      <Alerts />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <AdminRoute>
                      <Settings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <AdminRoute>
                      <UserManagement />
                    </AdminRoute>
                  }
                />
                <Route
                  path="connections"
                  element={
                    <PrivateRoute>
                      <Connections />
                    </PrivateRoute>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationProvider>
        </BrowserRouter>
      </ThemeProvider>
    </HostProvider>
  );
}


export default App;
