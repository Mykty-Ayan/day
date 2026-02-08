import { motion } from 'framer-motion'
import { Bed, DoorOpen, Building2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Property } from '../../types/property'
import StatusBadge from './StatusBadge'

interface Props {
  property: Property
  index: number
}

export default function PropertyCard({ property, index }: Props) {
  const photos = property.photos ?? []
  const coverPhoto = photos.find((p) => p.is_cover) || photos[0]

  return (
    <Link to="/properties/$propertyId" params={{ propertyId: property.id }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        whileHover={{ y: -2 }}
        className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden cursor-pointer transition-shadow hover:shadow-md"
      >
        {/* Cover Image */}
        <div className="aspect-[16/10] bg-gray-100 relative">
          {coverPhoto ? (
            <img
              src={coverPhoto.thumbnail_url || coverPhoto.url}
              alt={property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className="w-8 h-8 text-gray-300" />
            </div>
          )}
          <div className="absolute top-3 right-3">
            <StatusBadge status={property.status} />
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <h3 className="text-sm font-bold text-gray-900 truncate">
            {property.name}
          </h3>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {property.internal_name}
          </p>

          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <DoorOpen className="w-3.5 h-3.5" />
              <span>{property.rooms} rooms</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Bed className="w-3.5 h-3.5" />
              <span>{property.beds} beds</span>
            </div>
          </div>

          {property.pricing && (
            <p className="text-sm font-bold text-gray-900 mt-3">
              ${property.pricing.base_price}
              <span className="text-xs font-normal text-gray-500"> / night</span>
            </p>
          )}
        </div>
      </motion.div>
    </Link>
  )
}
