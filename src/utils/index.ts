// utils/index.ts

export const formatDate = (date: Date) => date.toLocaleDateString('vi-VN');

export const calculateDistance = (coord1: { lat: number; lng: number }, coord2: { lat: number; lng: number }) => {
  // Simple distance calculation
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111; // Approx km
};
