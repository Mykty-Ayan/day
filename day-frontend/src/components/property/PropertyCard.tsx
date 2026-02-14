import { motion } from 'framer-motion'
import { Bed, DoorOpen, Building2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Property } from '../../types/property'
import StatusBadge from './StatusBadge'

interface Props {
  property: Property
  index: number
  variant?: 'large' | 'medium' | 'list'
}

export default function PropertyCard({ property, index, variant = 'large' }: Props) {
  const photos = property.photos ?? []
  const coverPhoto = photos.find((p) => p.is_cover) || photos[0]
  const isList = variant === 'list'
  const isMedium = variant === 'medium'

  return (
    <Link to="/properties/$propertyId" params={{ propertyId: property.id }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        whileHover={{ y: -2 }}
        className={`bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden cursor-pointer transition-shadow hover:shadow-md ${
          isList ? 'flex items-stretch gap-4 p-3' : ''
        }`}
      >
        {/* Cover Image */}
        <div className={`${isList ? 'w-28 h-20 rounded-lg overflow-hidden shrink-0' : isMedium ? 'aspect-[16/9]' : 'aspect-[16/10]'} bg-gray-100 relative`}>
          {coverPhoto ? (
            <img
              src={coverPhoto.thumbnail_url || coverPhoto.url}
              alt={property.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 className={`${isList ? 'w-5 h-5' : 'w-8 h-8'} text-gray-300`} />
            </div>
          )}
          {!isList && (
            <div className="absolute top-3 right-3">
              <StatusBadge status={property.status} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className={`${isList ? 'flex-1 min-w-0 py-1' : isMedium ? 'p-3' : 'p-4'}`}>
          <div className={`flex items-center ${isList ? 'justify-between gap-3' : 'justify-start'}`}>
            <h3 className={`${isMedium ? 'text-[12px]' : 'text-sm'} font-bold text-gray-900 truncate`}>
              {property.name}
            </h3>
            {isList && <StatusBadge status={property.status} />}
          </div>
          <p className={`${isMedium ? 'text-[10px]' : 'text-xs'} text-gray-500 truncate mt-0.5`}>
            {property.internal_name}
          </p>

          <div className={`flex items-center gap-3 ${isList ? 'mt-2' : 'mt-3'}`}>
            <div className={`flex items-center gap-1 ${isMedium ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
              <DoorOpen className="w-3.5 h-3.5" />
              <span>{property.rooms} rooms</span>
            </div>
            <div className={`flex items-center gap-1 ${isMedium ? 'text-[10px]' : 'text-xs'} text-gray-500`}>
              <Bed className="w-3.5 h-3.5" />
              <span>{property.beds} beds</span>
            </div>
          </div>

          {property.pricing && (
            <p className={`${isMedium ? 'text-[12px]' : 'text-sm'} font-bold text-gray-900 ${isList ? 'mt-2' : 'mt-3'}`}>
              ${property.pricing.base_price}
              <span className={`${isMedium ? 'text-[10px]' : 'text-xs'} font-normal text-gray-500`}> / night</span>
            </p>
          )}
        </div>
      </motion.div>
    </Link>
  )
}
