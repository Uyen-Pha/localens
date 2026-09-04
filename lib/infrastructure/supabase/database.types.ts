export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      area_translations: {
        Row: {
          area_id: string
          description: string
          locale: Database["public"]["Enums"]["locale"]
          name: string
        }
        Insert: {
          area_id: string
          description: string
          locale: Database["public"]["Enums"]["locale"]
          name: string
        }
        Update: {
          area_id?: string
          description?: string
          locale?: Database["public"]["Enums"]["locale"]
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_translations_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          cancellation_policy: string
          catalog_snapshot_id: string
          checkout_amount_minor: number
          checkout_currency: Database["public"]["Enums"]["checkout_currency"]
          created_at: string
          departure_id: string | null
          fx_snapshot_id: string | null
          fx_vnd_per_usd: number | null
          hold_duration_seconds: number
          hold_expires_at: string
          id: string
          language: Database["public"]["Enums"]["locale"]
          meeting_point: string
          owner_user_id: string
          party_size: number
          per_person_vnd_minor: number | null
          quote_id: string | null
          source_id: string
          source_kind: string
          status: Database["public"]["Enums"]["booking_status"]
          title_en: string
          title_vi: string
          total_vnd_minor: number
          tour_version_id: string | null
          travel_snapshot_id: string
        }
        Insert: {
          cancellation_policy: string
          catalog_snapshot_id: string
          checkout_amount_minor: number
          checkout_currency: Database["public"]["Enums"]["checkout_currency"]
          created_at?: string
          departure_id?: string | null
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          hold_duration_seconds?: number
          hold_expires_at: string
          id?: string
          language: Database["public"]["Enums"]["locale"]
          meeting_point: string
          owner_user_id: string
          party_size: number
          per_person_vnd_minor?: number | null
          quote_id?: string | null
          source_id: string
          source_kind: string
          status?: Database["public"]["Enums"]["booking_status"]
          title_en: string
          title_vi: string
          total_vnd_minor: number
          tour_version_id?: string | null
          travel_snapshot_id: string
        }
        Update: {
          cancellation_policy?: string
          catalog_snapshot_id?: string
          checkout_amount_minor?: number
          checkout_currency?: Database["public"]["Enums"]["checkout_currency"]
          created_at?: string
          departure_id?: string | null
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          hold_duration_seconds?: number
          hold_expires_at?: string
          id?: string
          language?: Database["public"]["Enums"]["locale"]
          meeting_point?: string
          owner_user_id?: string
          party_size?: number
          per_person_vnd_minor?: number | null
          quote_id?: string | null
          source_id?: string
          source_kind?: string
          status?: Database["public"]["Enums"]["booking_status"]
          title_en?: string
          title_vi?: string
          total_vnd_minor?: number
          tour_version_id?: string | null
          travel_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_fx_snapshot_history_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "latest_fx_snapshot_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "custom_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "customer_custom_quotes_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_version_id"]
          },
          {
            foreignKeyName: "bookings_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "tour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      catalog_snapshot_area_translations: {
        Row: {
          area_id: string
          description: string
          locale: Database["public"]["Enums"]["locale"]
          name: string
          snapshot_id: string
        }
        Insert: {
          area_id: string
          description: string
          locale: Database["public"]["Enums"]["locale"]
          name: string
          snapshot_id: string
        }
        Update: {
          area_id?: string
          description?: string
          locale?: Database["public"]["Enums"]["locale"]
          name?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_area_translations_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas"
            referencedColumns: ["snapshot_id", "area_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_area_translations_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas_v"
            referencedColumns: ["snapshot_id", "area_id"]
          },
        ]
      }
      catalog_snapshot_areas: {
        Row: {
          area_id: string
          slug: string
          snapshot_id: string
        }
        Insert: {
          area_id: string
          slug: string
          snapshot_id: string
        }
        Update: {
          area_id?: string
          slug?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_areas_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_snapshot_food_item_supports: {
        Row: {
          item_id: string
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
        }
        Insert: {
          item_id: string
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
        }
        Update: {
          item_id?: string
          requirement?: string
          snapshot_id?: string
          status?: string
          support_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_item_supports_snapshot_id_item_id_fkey"
            columns: ["snapshot_id", "item_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_items"
            referencedColumns: ["snapshot_id", "item_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_item_supports_snapshot_id_item_id_fkey"
            columns: ["snapshot_id", "item_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_items_v"
            referencedColumns: ["snapshot_id", "item_id"]
          },
        ]
      }
      catalog_snapshot_food_item_translations: {
        Row: {
          description: string
          item_id: string
          locale: Database["public"]["Enums"]["locale"]
          snapshot_id: string
          title: string
        }
        Insert: {
          description: string
          item_id: string
          locale: Database["public"]["Enums"]["locale"]
          snapshot_id: string
          title: string
        }
        Update: {
          description?: string
          item_id?: string
          locale?: Database["public"]["Enums"]["locale"]
          snapshot_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_item_translation_snapshot_id_item_id_fkey"
            columns: ["snapshot_id", "item_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_items"
            referencedColumns: ["snapshot_id", "item_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_item_translation_snapshot_id_item_id_fkey"
            columns: ["snapshot_id", "item_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_items_v"
            referencedColumns: ["snapshot_id", "item_id"]
          },
        ]
      }
      catalog_snapshot_food_items: {
        Row: {
          allergens: string[]
          attribution: string
          available: boolean
          created_at: string
          item_id: string
          place_id: string
          portion_description: string
          price_vnd_max: number
          price_vnd_min: number
          serving_unit: string
          slug: string
          snapshot_id: string
          source_url: string
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          vendor_id: string
          verified_at: string
        }
        Insert: {
          allergens: string[]
          attribution: string
          available: boolean
          created_at: string
          item_id: string
          place_id: string
          portion_description: string
          price_vnd_max: number
          price_vnd_min: number
          serving_unit: string
          slug: string
          snapshot_id: string
          source_url: string
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          vendor_id: string
          verified_at: string
        }
        Update: {
          allergens?: string[]
          attribution?: string
          available?: boolean
          created_at?: string
          item_id?: string
          place_id?: string
          portion_description?: string
          price_vnd_max?: number
          price_vnd_min?: number
          serving_unit?: string
          slug?: string
          snapshot_id?: string
          source_url?: string
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          vendor_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_items_snapshot_id_place_id_vendor_id_fkey"
            columns: ["snapshot_id", "place_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "place_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_items_snapshot_id_place_id_vendor_id_fkey"
            columns: ["snapshot_id", "place_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "place_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendor_opening_exception_windows: {
        Row: {
          closes_at: string
          exception_id: string
          opens_at: string
          snapshot_id: string
          vendor_id: string
          window_id: string
        }
        Insert: {
          closes_at: string
          exception_id: string
          opens_at: string
          snapshot_id: string
          vendor_id: string
          window_id: string
        }
        Update: {
          closes_at?: string
          exception_id?: string
          opens_at?: string
          snapshot_id?: string
          vendor_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendor__snapshot_id_vendor_id_except_fkey"
            columns: ["snapshot_id", "vendor_id", "exception_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendor_opening_exceptions"
            referencedColumns: ["snapshot_id", "vendor_id", "exception_id"]
          },
        ]
      }
      catalog_snapshot_food_vendor_opening_exceptions: {
        Row: {
          closed: boolean
          exception_id: string
          local_date: string
          snapshot_id: string
          vendor_id: string
        }
        Insert: {
          closed: boolean
          exception_id: string
          local_date: string
          snapshot_id: string
          vendor_id: string
        }
        Update: {
          closed?: boolean
          exception_id?: string
          local_date?: string
          snapshot_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendor_openin_snapshot_id_vendor_id_fkey1"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendor_openin_snapshot_id_vendor_id_fkey1"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendor_opening_hours: {
        Row: {
          closes_at: string
          opening_id: string
          opens_at: string
          snapshot_id: string
          vendor_id: string
          weekday: number
        }
        Insert: {
          closes_at: string
          opening_id: string
          opens_at: string
          snapshot_id: string
          vendor_id: string
          weekday: number
        }
        Update: {
          closes_at?: string
          opening_id?: string
          opens_at?: string
          snapshot_id?: string
          vendor_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendor_opening_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendor_opening_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendor_supports: {
        Row: {
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
          vendor_id: string
        }
        Insert: {
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
          vendor_id: string
        }
        Update: {
          requirement?: string
          snapshot_id?: string
          status?: string
          support_kind?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendor_support_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendor_support_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendor_translations: {
        Row: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          snapshot_id: string
          title: string
          vendor_id: string
        }
        Insert: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          snapshot_id: string
          title: string
          vendor_id: string
        }
        Update: {
          description?: string
          locale?: Database["public"]["Enums"]["locale"]
          snapshot_id?: string
          title?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendor_transla_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendor_transla_snapshot_id_vendor_id_fkey"
            columns: ["snapshot_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendors: {
        Row: {
          attribution: string
          capacity_note: string
          created_at: string
          location_note: string
          place_id: string
          service_type: string
          slug: string
          snapshot_id: string
          source_url: string
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          vendor_id: string
          verified_at: string
        }
        Insert: {
          attribution: string
          capacity_note: string
          created_at: string
          location_note: string
          place_id: string
          service_type: string
          slug: string
          snapshot_id: string
          source_url: string
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          vendor_id: string
          verified_at: string
        }
        Update: {
          attribution?: string
          capacity_note?: string
          created_at?: string
          location_note?: string
          place_id?: string
          service_type?: string
          slug?: string
          snapshot_id?: string
          source_url?: string
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          vendor_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_experience_types: {
        Row: {
          experience_type: string
          place_id: string
          snapshot_id: string
        }
        Insert: {
          experience_type: string
          place_id: string
          snapshot_id: string
        }
        Update: {
          experience_type?: string
          place_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_experience_typ_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_experience_typ_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_guide_languages: {
        Row: {
          language: Database["public"]["Enums"]["locale"]
          place_id: string
          snapshot_id: string
        }
        Insert: {
          language: Database["public"]["Enums"]["locale"]
          place_id: string
          snapshot_id: string
        }
        Update: {
          language?: Database["public"]["Enums"]["locale"]
          place_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_guide_language_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_guide_language_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_opening_exception_windows: {
        Row: {
          closes_at: string
          exception_id: string
          opens_at: string
          place_id: string
          snapshot_id: string
          window_id: string
        }
        Insert: {
          closes_at: string
          exception_id: string
          opens_at: string
          place_id: string
          snapshot_id: string
          window_id: string
        }
        Update: {
          closes_at?: string
          exception_id?: string
          opens_at?: string
          place_id?: string
          snapshot_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_openin_snapshot_id_place_id_excepti_fkey"
            columns: ["snapshot_id", "place_id", "exception_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_place_opening_exceptions"
            referencedColumns: ["snapshot_id", "place_id", "exception_id"]
          },
        ]
      }
      catalog_snapshot_place_opening_exceptions: {
        Row: {
          closed: boolean
          exception_id: string
          local_date: string
          place_id: string
          snapshot_id: string
        }
        Insert: {
          closed: boolean
          exception_id: string
          local_date: string
          place_id: string
          snapshot_id: string
        }
        Update: {
          closed?: boolean
          exception_id?: string
          local_date?: string
          place_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_opening_except_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_opening_except_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_opening_hours: {
        Row: {
          closes_at: string
          opening_id: string
          opens_at: string
          place_id: string
          snapshot_id: string
          weekday: number
        }
        Insert: {
          closes_at: string
          opening_id: string
          opens_at: string
          place_id: string
          snapshot_id: string
          weekday: number
        }
        Update: {
          closes_at?: string
          opening_id?: string
          opens_at?: string
          place_id?: string
          snapshot_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_opening_hours_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_opening_hours_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_supports: {
        Row: {
          place_id: string
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
        }
        Insert: {
          place_id: string
          requirement: string
          snapshot_id: string
          status: string
          support_kind: string
        }
        Update: {
          place_id?: string
          requirement?: string
          snapshot_id?: string
          status?: string
          support_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_supports_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_supports_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_translations: {
        Row: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          place_id: string
          snapshot_id: string
          summary: string
          title: string
        }
        Insert: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          place_id: string
          snapshot_id: string
          summary: string
          title: string
        }
        Update: {
          description?: string
          locale?: Database["public"]["Enums"]["locale"]
          place_id?: string
          snapshot_id?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_translations_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_translations_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_places: {
        Row: {
          area_id: string
          attribution: string
          place_id: string
          price_vnd_per_person: number
          slug: string
          snapshot_id: string
          source_url: string
          verified_at: string
          visit_duration_minutes: number
        }
        Insert: {
          area_id: string
          attribution: string
          place_id: string
          price_vnd_per_person: number
          slug: string
          snapshot_id: string
          source_url: string
          verified_at: string
          visit_duration_minutes: number
        }
        Update: {
          area_id?: string
          attribution?: string
          place_id?: string
          price_vnd_per_person?: number
          slug?: string
          snapshot_id?: string
          source_url?: string
          verified_at?: string
          visit_duration_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas"
            referencedColumns: ["snapshot_id", "area_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas_v"
            referencedColumns: ["snapshot_id", "area_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_snapshots: {
        Row: {
          created_at: string
          id: string
          published_at: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          body: string
          created_at: string
          created_by: string
          description: string
          id: string
          image_attributions: Json
          locale: Database["public"]["Enums"]["locale"]
          slug: string
          source_urls: Json
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
          updated_by: string
          verified_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          image_attributions: Json
          locale: Database["public"]["Enums"]["locale"]
          slug: string
          source_urls: Json
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
          updated_by: string
          verified_at: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          image_attributions?: Json
          locale?: Database["public"]["Enums"]["locale"]
          slug?: string
          source_urls?: Json
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
          updated_by?: string
          verified_at?: string
        }
        Relationships: []
      }
      custom_quotes: {
        Row: {
          amount_vnd_minor: number
          catalog_snapshot_id: string
          checkout_amount_minor: number
          checkout_currency: Database["public"]["Enums"]["checkout_currency"]
          created_at: string
          food_estimate_max_vnd: number
          food_estimate_min_vnd: number
          food_snapshot: Json
          fx_snapshot_id: string | null
          fx_vnd_per_usd: number | null
          id: string
          pay_at_vendor_max_vnd: number
          pay_at_vendor_min_vnd: number
          policy: string
          request_id: string
          status: Database["public"]["Enums"]["quote_status"]
          title_en: string
          title_vi: string
          travel_snapshot_id: string
          valid_until: string | null
        }
        Insert: {
          amount_vnd_minor: number
          catalog_snapshot_id: string
          checkout_amount_minor: number
          checkout_currency: Database["public"]["Enums"]["checkout_currency"]
          created_at?: string
          food_estimate_max_vnd?: number
          food_estimate_min_vnd?: number
          food_snapshot?: Json
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          id?: string
          pay_at_vendor_max_vnd?: number
          pay_at_vendor_min_vnd?: number
          policy: string
          request_id: string
          status?: Database["public"]["Enums"]["quote_status"]
          title_en: string
          title_vi: string
          travel_snapshot_id: string
          valid_until?: string | null
        }
        Update: {
          amount_vnd_minor?: number
          catalog_snapshot_id?: string
          checkout_amount_minor?: number
          checkout_currency?: Database["public"]["Enums"]["checkout_currency"]
          created_at?: string
          food_estimate_max_vnd?: number
          food_estimate_min_vnd?: number
          food_snapshot?: Json
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          id?: string
          pay_at_vendor_max_vnd?: number
          pay_at_vendor_min_vnd?: number
          policy?: string
          request_id?: string
          status?: Database["public"]["Enums"]["quote_status"]
          title_en?: string
          title_vi?: string
          travel_snapshot_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_quotes_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_fx_snapshot_history_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "latest_fx_snapshot_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "admin_custom_request_queue_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "custom_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_custom_requests_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      custom_requests: {
        Row: {
          created_at: string
          id: string
          latest_decision_at: string | null
          owner_user_id: string
          plan_id: string
          revision_id: string
          revision_no: number
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latest_decision_at?: string | null
          owner_user_id: string
          plan_id: string
          revision_id: string
          revision_no: number
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latest_decision_at?: string | null
          owner_user_id?: string
          plan_id?: string
          revision_id?: string
          revision_no?: number
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_requests_plan_id_owner_user_id_fkey"
            columns: ["plan_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id", "owner_user_id"]
          },
          {
            foreignKeyName: "custom_requests_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "trip_plan_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_requests_revision_id_plan_id_revision_no_fkey"
            columns: ["revision_id", "plan_id", "revision_no"]
            isOneToOne: false
            referencedRelation: "trip_plan_revisions"
            referencedColumns: ["id", "plan_id", "revision_no"]
          },
        ]
      }
      departures: {
        Row: {
          capacity: number
          created_at: string
          end_at: string
          id: string
          start_at: string
          status: Database["public"]["Enums"]["departure_status"]
          tour_version_id: string
        }
        Insert: {
          capacity: number
          created_at?: string
          end_at: string
          id?: string
          start_at: string
          status?: Database["public"]["Enums"]["departure_status"]
          tour_version_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          end_at?: string
          id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["departure_status"]
          tour_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departures_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_version_id"]
          },
          {
            foreignKeyName: "departures_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "tour_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_supports: {
        Row: {
          food_item_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Insert: {
          food_item_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Update: {
          food_item_id?: string
          requirement?: string
          status?: string
          support_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_supports_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "food_item_supports_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_item_translations: {
        Row: {
          description: string
          food_item_id: string
          locale: Database["public"]["Enums"]["locale"]
          title: string
        }
        Insert: {
          description: string
          food_item_id: string
          locale: Database["public"]["Enums"]["locale"]
          title: string
        }
        Update: {
          description?: string
          food_item_id?: string
          locale?: Database["public"]["Enums"]["locale"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_item_translations_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "food_item_translations_item_id_fkey"
            columns: ["food_item_id"]
            isOneToOne: false
            referencedRelation: "food_items"
            referencedColumns: ["id"]
          },
        ]
      }
      food_items: {
        Row: {
          allergens: string[]
          attribution: string | null
          available: boolean
          created_at: string
          food_vendor_id: string
          id: string
          portion_description: string
          price_vnd_max: number | null
          price_vnd_min: number | null
          serving_unit: string
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          allergens?: string[]
          attribution?: string | null
          available?: boolean
          created_at?: string
          food_vendor_id: string
          id?: string
          portion_description: string
          price_vnd_max?: number | null
          price_vnd_min?: number | null
          serving_unit: string
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          allergens?: string[]
          attribution?: string | null
          available?: boolean
          created_at?: string
          food_vendor_id?: string
          id?: string
          portion_description?: string
          price_vnd_max?: number | null
          price_vnd_min?: number | null
          serving_unit?: string
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_items_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "food_items_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      food_vendor_opening_exception_windows: {
        Row: {
          closes_at: string
          exception_id: string
          food_vendor_id: string
          id: string
          opens_at: string
        }
        Insert: {
          closes_at: string
          exception_id: string
          food_vendor_id: string
          id?: string
          opens_at: string
        }
        Update: {
          closes_at?: string
          exception_id?: string
          food_vendor_id?: string
          id?: string
          opens_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_vendor_exception_windows_parent_fkey"
            columns: ["exception_id", "food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendor_opening_exceptions"
            referencedColumns: ["id", "food_vendor_id"]
          },
        ]
      }
      food_vendor_opening_exceptions: {
        Row: {
          closed: boolean
          food_vendor_id: string
          id: string
          local_date: string
        }
        Insert: {
          closed?: boolean
          food_vendor_id: string
          id?: string
          local_date: string
        }
        Update: {
          closed?: boolean
          food_vendor_id?: string
          id?: string
          local_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_vendor_opening_exceptions_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "food_vendor_opening_exceptions_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      food_vendor_opening_hours: {
        Row: {
          closes_at: string
          food_vendor_id: string
          id: string
          opens_at: string
          weekday: number
        }
        Insert: {
          closes_at: string
          food_vendor_id: string
          id?: string
          opens_at: string
          weekday: number
        }
        Update: {
          closes_at?: string
          food_vendor_id?: string
          id?: string
          opens_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "food_vendor_opening_hours_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "food_vendor_opening_hours_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      food_vendor_supports: {
        Row: {
          food_vendor_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Insert: {
          food_vendor_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Update: {
          food_vendor_id?: string
          requirement?: string
          status?: string
          support_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_vendor_supports_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "food_vendor_supports_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      food_vendor_translations: {
        Row: {
          description: string
          food_vendor_id: string
          locale: Database["public"]["Enums"]["locale"]
          title: string
        }
        Insert: {
          description: string
          food_vendor_id: string
          locale: Database["public"]["Enums"]["locale"]
          title: string
        }
        Update: {
          description?: string
          food_vendor_id?: string
          locale?: Database["public"]["Enums"]["locale"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_vendor_translations_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_food_catalog_review_v"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "food_vendor_translations_vendor_id_fkey"
            columns: ["food_vendor_id"]
            isOneToOne: false
            referencedRelation: "food_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      food_vendors: {
        Row: {
          attribution: string | null
          capacity_note: string
          created_at: string
          id: string
          location_note: string
          place_id: string
          service_type: string
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          attribution?: string | null
          capacity_note: string
          created_at?: string
          id?: string
          location_note: string
          place_id: string
          service_type: string
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          attribution?: string | null
          capacity_note?: string
          created_at?: string
          id?: string
          location_note?: string
          place_id?: string
          service_type?: string
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_vendors_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_snapshots: {
        Row: {
          environment: string
          id: string
          is_demo: boolean
          observed_at: string
          source: string
          vnd_per_usd: number
        }
        Insert: {
          environment: string
          id?: string
          is_demo: boolean
          observed_at: string
          source: string
          vnd_per_usd: number
        }
        Update: {
          environment?: string
          id?: string
          is_demo?: boolean
          observed_at?: string
          source?: string
          vnd_per_usd?: number
        }
        Relationships: []
      }
      guide_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          booking_id: string
          closed_at: string | null
          completed_at: string | null
          created_at: string
          dietary_flags: string[]
          guide_user_id: string
          id: string
          mobility_flags: string[]
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          booking_id: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          dietary_flags?: string[]
          guide_user_id: string
          id?: string
          mobility_flags?: string[]
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          booking_id?: string
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          dietary_flags?: string[]
          guide_user_id?: string
          id?: string
          mobility_flags?: string[]
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "admin_booking_management_v"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "guide_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "customer_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guide_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "customer_simulated_payment_status_v"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      guide_profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          language: Database["public"]["Enums"]["locale"]
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          language?: Database["public"]["Enums"]["locale"]
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          language?: Database["public"]["Enums"]["locale"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_minor: number
          attempt_id: string
          booking_id: string
          created_at: string
          currency: Database["public"]["Enums"]["checkout_currency"]
          id: string
          mode: string
          owner_user_id: string
          provider_account_id: string
          provider_endpoint_id: string
          provider_payment_intent_id: string | null
          provider_session_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          attempt_id: string
          booking_id: string
          created_at?: string
          currency: Database["public"]["Enums"]["checkout_currency"]
          id?: string
          mode: string
          owner_user_id: string
          provider_account_id: string
          provider_endpoint_id: string
          provider_payment_intent_id?: string | null
          provider_session_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          attempt_id?: string
          booking_id?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["checkout_currency"]
          id?: string
          mode?: string
          owner_user_id?: string
          provider_account_id?: string
          provider_endpoint_id?: string
          provider_payment_intent_id?: string | null
          provider_session_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "admin_booking_management_v"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_simulated_payment_status_v"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      place_experience_types: {
        Row: {
          experience_type: string
          place_id: string
        }
        Insert: {
          experience_type: string
          place_id: string
        }
        Update: {
          experience_type?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_experience_types_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_guide_languages: {
        Row: {
          language: Database["public"]["Enums"]["locale"]
          place_id: string
        }
        Insert: {
          language: Database["public"]["Enums"]["locale"]
          place_id: string
        }
        Update: {
          language?: Database["public"]["Enums"]["locale"]
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_guide_languages_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_opening_exception_windows: {
        Row: {
          closes_at: string
          exception_id: string
          id: string
          opens_at: string
          place_id: string
        }
        Insert: {
          closes_at: string
          exception_id: string
          id?: string
          opens_at: string
          place_id: string
        }
        Update: {
          closes_at?: string
          exception_id?: string
          id?: string
          opens_at?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_opening_exception_windows_exception_id_place_id_fkey"
            columns: ["exception_id", "place_id"]
            isOneToOne: false
            referencedRelation: "place_opening_exceptions"
            referencedColumns: ["id", "place_id"]
          },
        ]
      }
      place_opening_exceptions: {
        Row: {
          closed: boolean
          id: string
          local_date: string
          place_id: string
        }
        Insert: {
          closed?: boolean
          id?: string
          local_date: string
          place_id: string
        }
        Update: {
          closed?: boolean
          id?: string
          local_date?: string
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_opening_exceptions_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_opening_hours: {
        Row: {
          closes_at: string
          id: string
          opens_at: string
          place_id: string
          weekday: number
        }
        Insert: {
          closes_at: string
          id?: string
          opens_at: string
          place_id: string
          weekday: number
        }
        Update: {
          closes_at?: string
          id?: string
          opens_at?: string
          place_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "place_opening_hours_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_supports: {
        Row: {
          place_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Insert: {
          place_id: string
          requirement: string
          status: string
          support_kind: string
        }
        Update: {
          place_id?: string
          requirement?: string
          status?: string
          support_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_supports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_translations: {
        Row: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          place_id: string
          summary: string
          title: string
        }
        Insert: {
          description: string
          locale: Database["public"]["Enums"]["locale"]
          place_id: string
          summary: string
          title: string
        }
        Update: {
          description?: string
          locale?: Database["public"]["Enums"]["locale"]
          place_id?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_translations_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          area_id: string
          attribution: string | null
          created_at: string
          id: string
          price_vnd_per_person: number
          slug: string
          source_url: string | null
          status: Database["public"]["Enums"]["place_status"]
          updated_at: string
          verified_at: string | null
          visit_duration_minutes: number
        }
        Insert: {
          area_id: string
          attribution?: string | null
          created_at?: string
          id?: string
          price_vnd_per_person?: number
          slug: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
          visit_duration_minutes?: number
        }
        Update: {
          area_id?: string
          attribution?: string | null
          created_at?: string
          id?: string
          price_vnd_per_person?: number
          slug?: string
          source_url?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          updated_at?: string
          verified_at?: string | null
          visit_duration_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "places_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          language: Database["public"]["Enums"]["locale"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          language?: Database["public"]["Enums"]["locale"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          language?: Database["public"]["Enums"]["locale"]
          updated_at?: string
        }
        Relationships: []
      }
      seo_releases: {
        Row: {
          artifact_hash: string | null
          build_id: string
          created_at: string
          created_by: string
          failed_at: string | null
          failure_code: string | null
          id: string
          published_at: string | null
          publishing_at: string | null
          source_commit: string
          status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          artifact_hash?: string | null
          build_id: string
          created_at?: string
          created_by: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          published_at?: string | null
          publishing_at?: string | null
          source_commit: string
          status?: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          artifact_hash?: string | null
          build_id?: string
          created_at?: string
          created_by?: string
          failed_at?: string | null
          failure_code?: string | null
          id?: string
          published_at?: string | null
          publishing_at?: string | null
          source_commit?: string
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: []
      }
      tour_translations: {
        Row: {
          locale: Database["public"]["Enums"]["locale"]
          meeting_point: string
          summary: string
          title: string
          tour_id: string
        }
        Insert: {
          locale: Database["public"]["Enums"]["locale"]
          meeting_point: string
          summary: string
          title: string
          tour_id: string
        }
        Update: {
          locale?: Database["public"]["Enums"]["locale"]
          meeting_point?: string
          summary?: string
          title?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_translations_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_id"]
          },
          {
            foreignKeyName: "tour_translations_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_version_stops: {
        Row: {
          catalog_snapshot_id: string
          place_id: string
          position: number
          tour_version_id: string
        }
        Insert: {
          catalog_snapshot_id: string
          place_id: string
          position: number
          tour_version_id: string
        }
        Update: {
          catalog_snapshot_id?: string
          place_id?: string
          position?: number
          tour_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_version_stops_catalog_snapshot_id_place_id_fkey"
            columns: ["catalog_snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "tour_version_stops_catalog_snapshot_id_place_id_fkey"
            columns: ["catalog_snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "tour_version_stops_tour_version_id_catalog_snapshot_id_fkey"
            columns: ["tour_version_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "tour_versions"
            referencedColumns: ["id", "catalog_snapshot_id"]
          },
        ]
      }
      tour_version_translations: {
        Row: {
          locale: Database["public"]["Enums"]["locale"]
          meeting_point: string
          summary: string
          title: string
          tour_version_id: string
        }
        Insert: {
          locale: Database["public"]["Enums"]["locale"]
          meeting_point: string
          summary: string
          title: string
          tour_version_id: string
        }
        Update: {
          locale?: Database["public"]["Enums"]["locale"]
          meeting_point?: string
          summary?: string
          title?: string
          tour_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_version_translations_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_version_id"]
          },
          {
            foreignKeyName: "tour_version_translations_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "tour_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_versions: {
        Row: {
          attribution: string
          cancellation_policy: string
          catalog_snapshot_id: string
          created_at: string
          duration_minutes: number
          exclusions: string[]
          id: string
          inclusions: string[]
          license: string
          price_vnd_per_person: number
          published_at: string | null
          source_url: string
          status: Database["public"]["Enums"]["tour_version_status"]
          tour_id: string
          verified_at: string
        }
        Insert: {
          attribution: string
          cancellation_policy: string
          catalog_snapshot_id: string
          created_at?: string
          duration_minutes: number
          exclusions?: string[]
          id?: string
          inclusions?: string[]
          license: string
          price_vnd_per_person: number
          published_at?: string | null
          source_url: string
          status?: Database["public"]["Enums"]["tour_version_status"]
          tour_id: string
          verified_at: string
        }
        Update: {
          attribution?: string
          cancellation_policy?: string
          catalog_snapshot_id?: string
          created_at?: string
          duration_minutes?: number
          exclusions?: string[]
          id?: string
          inclusions?: string[]
          license?: string
          price_vnd_per_person?: number
          published_at?: string | null
          source_url?: string
          status?: Database["public"]["Enums"]["tour_version_status"]
          tour_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_versions_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_versions_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_id"]
          },
          {
            foreignKeyName: "tour_versions_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          created_at: string
          id: string
          slug: string
          status: Database["public"]["Enums"]["tour_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          slug: string
          status?: Database["public"]["Enums"]["tour_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          slug?: string
          status?: Database["public"]["Enums"]["tour_status"]
          updated_at?: string
        }
        Relationships: []
      }
      travel_edges: {
        Row: {
          from_place_id: string
          group_cost_vnd: number
          id: string
          minutes: number
          mode: string
          to_place_id: string
          verified_at: string
        }
        Insert: {
          from_place_id: string
          group_cost_vnd: number
          id?: string
          minutes: number
          mode: string
          to_place_id: string
          verified_at: string
        }
        Update: {
          from_place_id?: string
          group_cost_vnd?: number
          id?: string
          minutes?: number
          mode?: string
          to_place_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_edges_from_place_id_fkey"
            columns: ["from_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_edges_to_place_id_fkey"
            columns: ["to_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_snapshot_edges: {
        Row: {
          catalog_snapshot_id: string
          from_place_id: string
          group_cost_vnd: number
          minutes: number
          mode: string
          snapshot_id: string
          source_edge_id: string
          to_place_id: string
          verified_at: string
        }
        Insert: {
          catalog_snapshot_id: string
          from_place_id: string
          group_cost_vnd: number
          minutes: number
          mode: string
          snapshot_id: string
          source_edge_id: string
          to_place_id: string
          verified_at: string
        }
        Update: {
          catalog_snapshot_id?: string
          from_place_id?: string
          group_cost_vnd?: number
          minutes?: number
          mode?: string
          snapshot_id?: string
          source_edge_id?: string
          to_place_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_snapshot_edges_catalog_snapshot_id_from_place_id_fkey"
            columns: ["catalog_snapshot_id", "from_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_catalog_snapshot_id_from_place_id_fkey"
            columns: ["catalog_snapshot_id", "from_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_catalog_snapshot_id_to_place_id_fkey"
            columns: ["catalog_snapshot_id", "to_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_catalog_snapshot_id_to_place_id_fkey"
            columns: ["catalog_snapshot_id", "to_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "travel_snapshot_edges_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id", "catalog_snapshot_id"]
          },
        ]
      }
      travel_snapshots: {
        Row: {
          catalog_snapshot_id: string
          created_at: string
          id: string
          published_at: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
        }
        Insert: {
          catalog_snapshot_id: string
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Update: {
          catalog_snapshot_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "travel_snapshots_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plan_items: {
        Row: {
          catalog_snapshot_id: string
          customer_payable_vnd: number
          end_at: string
          food_cost_max_vnd: number
          food_cost_min_vnd: number
          food_selection_json: Json | null
          pay_at_vendor_max_vnd: number
          pay_at_vendor_min_vnd: number
          place_cost_vnd: number
          place_id: string
          position: number
          revision_id: string
          score: number
          start_at: string
          transition_buffer_minutes_before: number
          travel_cost_vnd_before: number
          travel_minutes_before: number
          visit_duration_minutes: number
        }
        Insert: {
          catalog_snapshot_id: string
          customer_payable_vnd?: number
          end_at: string
          food_cost_max_vnd?: number
          food_cost_min_vnd?: number
          food_selection_json?: Json | null
          pay_at_vendor_max_vnd?: number
          pay_at_vendor_min_vnd?: number
          place_cost_vnd: number
          place_id: string
          position: number
          revision_id: string
          score: number
          start_at: string
          transition_buffer_minutes_before: number
          travel_cost_vnd_before: number
          travel_minutes_before: number
          visit_duration_minutes: number
        }
        Update: {
          catalog_snapshot_id?: string
          customer_payable_vnd?: number
          end_at?: string
          food_cost_max_vnd?: number
          food_cost_min_vnd?: number
          food_selection_json?: Json | null
          pay_at_vendor_max_vnd?: number
          pay_at_vendor_min_vnd?: number
          place_cost_vnd?: number
          place_id?: string
          position?: number
          revision_id?: string
          score?: number
          start_at?: string
          transition_buffer_minutes_before?: number
          travel_cost_vnd_before?: number
          travel_minutes_before?: number
          visit_duration_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_items_catalog_snapshot_id_place_id_fkey"
            columns: ["catalog_snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "trip_plan_items_catalog_snapshot_id_place_id_fkey"
            columns: ["catalog_snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "trip_plan_items_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "trip_plan_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plan_revisions: {
        Row: {
          actor_user_id: string | null
          base_revision_no: number
          budget_vnd: number
          catalog_snapshot_id: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          fingerprint: string
          fx_snapshot_id: string | null
          fx_vnd_per_usd: number | null
          id: string
          locked_place_ids: string[]
          plan_id: string
          ranking_source: Database["public"]["Enums"]["ranking_source"]
          request_json: Json
          result_json: Json
          revision_no: number
          total_cost_vnd: number
          total_duration_minutes: number
          travel_snapshot_id: string
        }
        Insert: {
          actor_user_id?: string | null
          base_revision_no: number
          budget_vnd: number
          catalog_snapshot_id: string
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          fingerprint: string
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          id?: string
          locked_place_ids?: string[]
          plan_id: string
          ranking_source: Database["public"]["Enums"]["ranking_source"]
          request_json: Json
          result_json: Json
          revision_no: number
          total_cost_vnd: number
          total_duration_minutes: number
          travel_snapshot_id: string
        }
        Update: {
          actor_user_id?: string | null
          base_revision_no?: number
          budget_vnd?: number
          catalog_snapshot_id?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fingerprint?: string
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          id?: string
          locked_place_ids?: string[]
          plan_id?: string
          ranking_source?: Database["public"]["Enums"]["ranking_source"]
          request_json?: Json
          result_json?: Json
          revision_no?: number
          total_cost_vnd?: number
          total_duration_minutes?: number
          travel_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_revisions_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_fx_snapshot_history_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "latest_fx_snapshot_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_catalog_snapshot_id_fkey"
            columns: ["travel_snapshot_id", "catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id", "catalog_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_revisions_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      trip_plans: {
        Row: {
          created_at: string
          guest_binding_id: string | null
          id: string
          latest_revision_no: number
          owner_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          guest_binding_id?: string | null
          id?: string
          latest_revision_no?: number
          owner_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          guest_binding_id?: string | null
          id?: string
          latest_revision_no?: number
          owner_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_audit_events_v: {
        Row: {
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          correlation_id: string | null
          created_at: string | null
          event_type: Database["public"]["Enums"]["audit_event_type"] | null
          from_state: string | null
          id: string | null
          metadata: Json | null
          target_id: string | null
          target_type: Database["public"]["Enums"]["audit_target_type"] | null
          to_state: string | null
        }
        Insert: {
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["audit_event_type"] | null
          from_state?: string | null
          id?: string | null
          metadata?: never
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["audit_target_type"] | null
          to_state?: string | null
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["audit_event_type"] | null
          from_state?: string | null
          id?: string | null
          metadata?: never
          target_id?: string | null
          target_type?: Database["public"]["Enums"]["audit_target_type"] | null
          to_state?: string | null
        }
        Relationships: []
      }
      admin_booking_cancellations_v: {
        Row: {
          booking_id: string | null
          cancelled_at: string | null
          customer_user_id: string | null
          id: string | null
          idempotency_key: string | null
          other_reason: string | null
          reason_code: string | null
          source_kind: string | null
        }
        Insert: {
          booking_id?: string | null
          cancelled_at?: string | null
          customer_user_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          other_reason?: string | null
          reason_code?: string | null
          source_kind?: string | null
        }
        Update: {
          booking_id?: string | null
          cancelled_at?: string | null
          customer_user_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          other_reason?: string | null
          reason_code?: string | null
          source_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "admin_booking_management_v"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_simulated_payment_status_v"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      admin_booking_management_v: {
        Row: {
          booking_id: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          cancellation_id: string | null
          cancellation_idempotency_key: string | null
          cancellation_other_reason: string | null
          cancellation_reason_code: string | null
          cancelled_at: string | null
          created_at: string | null
          customer_user_id: string | null
          source_kind: string | null
          title_en: string | null
          title_vi: string | null
        }
        Relationships: []
      }
      admin_content_drafts_v: {
        Row: {
          body: string | null
          description: string | null
          id: string | null
          image_attributions: Json | null
          locale: Database["public"]["Enums"]["locale"] | null
          slug: string | null
          source_urls: Json | null
          status: Database["public"]["Enums"]["content_status"] | null
          title: string | null
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          body?: string | null
          description?: string | null
          id?: string | null
          image_attributions?: Json | null
          locale?: Database["public"]["Enums"]["locale"] | null
          slug?: string | null
          source_urls?: Json | null
          status?: Database["public"]["Enums"]["content_status"] | null
          title?: string | null
          updated_at?: string | null
          verified_at?: never
        }
        Update: {
          body?: string | null
          description?: string | null
          id?: string | null
          image_attributions?: Json | null
          locale?: Database["public"]["Enums"]["locale"] | null
          slug?: string | null
          source_urls?: Json | null
          status?: Database["public"]["Enums"]["content_status"] | null
          title?: string | null
          updated_at?: string | null
          verified_at?: never
        }
        Relationships: []
      }
      admin_custom_request_queue_v: {
        Row: {
          id: string | null
          latest_decision_at: string | null
          owner_user_id: string | null
          plan_id: string | null
          revision_no: number | null
          status: Database["public"]["Enums"]["request_status"] | null
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string | null
          latest_decision_at?: never
          owner_user_id?: string | null
          plan_id?: string | null
          revision_no?: number | null
          status?: Database["public"]["Enums"]["request_status"] | null
          submitted_at?: never
          updated_at?: never
        }
        Update: {
          id?: string | null
          latest_decision_at?: never
          owner_user_id?: string | null
          plan_id?: string | null
          revision_no?: number | null
          status?: Database["public"]["Enums"]["request_status"] | null
          submitted_at?: never
          updated_at?: never
        }
        Relationships: [
          {
            foreignKeyName: "custom_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_requests_plan_id_owner_user_id_fkey"
            columns: ["plan_id", "owner_user_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      admin_food_catalog_review_v: {
        Row: {
          audit_history: Json | null
          item: Json | null
          item_id: string | null
          place_id: string | null
          vendor: Json | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_vendors_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_snapshot_areas_v: {
        Row: {
          area_id: string | null
          slug: string | null
          snapshot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_areas_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_snapshot_food_items_v: {
        Row: {
          allergens: Json | null
          available: boolean | null
          description: Json | null
          dietary_support: Json | null
          item_id: string | null
          place_id: string | null
          portion_description: string | null
          price_vnd_max: string | null
          price_vnd_min: string | null
          serving_unit: string | null
          slug: string | null
          snapshot_id: string | null
          status: string | null
          title: Json | null
          vendor_id: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_items_snapshot_id_place_id_vendor_id_fkey"
            columns: ["snapshot_id", "place_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors"
            referencedColumns: ["snapshot_id", "place_id", "vendor_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_items_snapshot_id_place_id_vendor_id_fkey"
            columns: ["snapshot_id", "place_id", "vendor_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_food_vendors_v"
            referencedColumns: ["snapshot_id", "place_id", "vendor_id"]
          },
        ]
      }
      catalog_snapshot_food_vendors_v: {
        Row: {
          capacity_note: string | null
          description: Json | null
          dietary_support: Json | null
          location_note: string | null
          mobility_support: Json | null
          opening_exceptions: Json | null
          opening_hours: Json | null
          place_id: string | null
          service_type: string | null
          slug: string | null
          snapshot_id: string | null
          status: string | null
          title: Json | null
          vendor_id: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_food_vendors_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_place_display_v: {
        Row: {
          locale: Database["public"]["Enums"]["locale"] | null
          place_id: string | null
          snapshot_id: string | null
          summary: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_place_translations_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places"
            referencedColumns: ["snapshot_id", "place_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_place_translations_snapshot_id_place_id_fkey"
            columns: ["snapshot_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_places_v"
            referencedColumns: ["snapshot_id", "place_id"]
          },
        ]
      }
      catalog_snapshot_places_v: {
        Row: {
          area_id: string | null
          dietary_support: Json | null
          experience_types: Json | null
          guide_languages: Json | null
          mobility_support: Json | null
          opening_exceptions: Json | null
          opening_hours: Json | null
          place_id: string | null
          price_vnd_per_person: string | null
          snapshot_id: string | null
          visit_duration_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas"
            referencedColumns: ["snapshot_id", "area_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_area_id_fkey"
            columns: ["snapshot_id", "area_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshot_areas_v"
            referencedColumns: ["snapshot_id", "area_id"]
          },
          {
            foreignKeyName: "catalog_snapshot_places_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      current_itinerary_snapshot_v: {
        Row: {
          catalog_snapshot_id: string | null
          fx_environment: string | null
          fx_is_demo: boolean | null
          fx_observed_at: string | null
          fx_snapshot_id: string | null
          fx_source: string | null
          fx_vnd_per_usd: string | null
          travel_published_at: string | null
          travel_snapshot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_snapshots_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_booking_cancellations_v: {
        Row: {
          booking_id: string | null
          cancelled_at: string | null
          customer_user_id: string | null
          id: string | null
          idempotency_key: string | null
          other_reason: string | null
          reason_code: string | null
          source_kind: string | null
        }
        Insert: {
          booking_id?: string | null
          cancelled_at?: string | null
          customer_user_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          other_reason?: string | null
          reason_code?: string | null
          source_kind?: string | null
        }
        Update: {
          booking_id?: string | null
          cancelled_at?: string | null
          customer_user_id?: string | null
          id?: string | null
          idempotency_key?: string | null
          other_reason?: string | null
          reason_code?: string | null
          source_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "admin_booking_management_v"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_simulated_payment_status_v"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      customer_bookings_v: {
        Row: {
          cancellation_policy: string | null
          catalog_snapshot_id: string | null
          checkout_amount_minor: string | null
          checkout_currency:
            | Database["public"]["Enums"]["checkout_currency"]
            | null
          created_at: string | null
          fx_snapshot_id: string | null
          fx_vnd_per_usd: number | null
          hold_expires_at: string | null
          id: string | null
          language: Database["public"]["Enums"]["locale"] | null
          meeting_point: string | null
          party_size: number | null
          per_person_vnd_minor: string | null
          quote_id: string | null
          source_id: string | null
          source_kind: string | null
          status: Database["public"]["Enums"]["booking_status"] | null
          title_en: string | null
          title_vi: string | null
          total_vnd_minor: string | null
          tour_version_id: string | null
          travel_snapshot_id: string | null
        }
        Insert: {
          cancellation_policy?: string | null
          catalog_snapshot_id?: string | null
          checkout_amount_minor?: never
          checkout_currency?:
            | Database["public"]["Enums"]["checkout_currency"]
            | null
          created_at?: string | null
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          hold_expires_at?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["locale"] | null
          meeting_point?: string | null
          party_size?: number | null
          per_person_vnd_minor?: never
          quote_id?: string | null
          source_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          title_en?: string | null
          title_vi?: string | null
          total_vnd_minor?: never
          tour_version_id?: string | null
          travel_snapshot_id?: string | null
        }
        Update: {
          cancellation_policy?: string | null
          catalog_snapshot_id?: string | null
          checkout_amount_minor?: never
          checkout_currency?:
            | Database["public"]["Enums"]["checkout_currency"]
            | null
          created_at?: string | null
          fx_snapshot_id?: string | null
          fx_vnd_per_usd?: number | null
          hold_expires_at?: string | null
          id?: string | null
          language?: Database["public"]["Enums"]["locale"] | null
          meeting_point?: string | null
          party_size?: number | null
          per_person_vnd_minor?: never
          quote_id?: string | null
          source_id?: string | null
          source_kind?: string | null
          status?: Database["public"]["Enums"]["booking_status"] | null
          title_en?: string | null
          title_vi?: string | null
          total_vnd_minor?: never
          tour_version_id?: string | null
          travel_snapshot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "fx_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_fx_snapshot_history_v"
            referencedColumns: ["fx_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_fx_snapshot_id_fkey"
            columns: ["fx_snapshot_id"]
            isOneToOne: false
            referencedRelation: "latest_fx_snapshot_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "custom_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "customer_custom_quotes_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "published_tours_v"
            referencedColumns: ["tour_version_id"]
          },
          {
            foreignKeyName: "bookings_tour_version_id_fkey"
            columns: ["tour_version_id"]
            isOneToOne: false
            referencedRelation: "tour_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "current_itinerary_snapshot_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "itinerary_travel_snapshot_history_v"
            referencedColumns: ["travel_snapshot_id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_travel_snapshot_id_fkey"
            columns: ["travel_snapshot_id"]
            isOneToOne: false
            referencedRelation: "travel_snapshots_v"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      customer_custom_quotes_v: {
        Row: {
          amount_minor: string | null
          amount_vnd_minor: string | null
          currency: Database["public"]["Enums"]["checkout_currency"] | null
          food_estimate_max_vnd: string | null
          food_estimate_min_vnd: string | null
          food_snapshot: Json | null
          id: string | null
          pay_at_vendor_max_vnd: string | null
          pay_at_vendor_min_vnd: string | null
          policy: string | null
          request_id: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          title: string | null
          valid_until: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "admin_custom_request_queue_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "custom_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_custom_requests_v"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_custom_requests_v: {
        Row: {
          id: string | null
          plan_id: string | null
          revision_no: number | null
          status: Database["public"]["Enums"]["request_status"] | null
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string | null
          plan_id?: string | null
          revision_no?: number | null
          status?: Database["public"]["Enums"]["request_status"] | null
          submitted_at?: never
          updated_at?: never
        }
        Update: {
          id?: string | null
          plan_id?: string | null
          revision_no?: number | null
          status?: Database["public"]["Enums"]["request_status"] | null
          submitted_at?: never
          updated_at?: never
        }
        Relationships: [
          {
            foreignKeyName: "custom_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_status_v: {
        Row: {
          amount_minor: string | null
          booking_id: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          currency: Database["public"]["Enums"]["checkout_currency"] | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "admin_booking_management_v"
            referencedColumns: ["booking_id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_bookings_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "customer_simulated_payment_status_v"
            referencedColumns: ["booking_id"]
          },
        ]
      }
      customer_simulated_payment_status_v: {
        Row: {
          amount_minor: string | null
          booking_id: string | null
          booking_status: Database["public"]["Enums"]["booking_status"] | null
          currency: Database["public"]["Enums"]["checkout_currency"] | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          simulated_at: string | null
        }
        Relationships: []
      }
      itinerary_fx_snapshot_history_v: {
        Row: {
          fx_environment: string | null
          fx_is_demo: boolean | null
          fx_observed_at: string | null
          fx_snapshot_id: string | null
          fx_source: string | null
          fx_vnd_per_usd: string | null
        }
        Insert: {
          fx_environment?: string | null
          fx_is_demo?: boolean | null
          fx_observed_at?: never
          fx_snapshot_id?: string | null
          fx_source?: string | null
          fx_vnd_per_usd?: never
        }
        Update: {
          fx_environment?: string | null
          fx_is_demo?: boolean | null
          fx_observed_at?: never
          fx_snapshot_id?: string | null
          fx_source?: string | null
          fx_vnd_per_usd?: never
        }
        Relationships: []
      }
      itinerary_travel_snapshot_history_v: {
        Row: {
          catalog_snapshot_id: string | null
          travel_published_at: string | null
          travel_snapshot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_snapshots_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      latest_fx_snapshot_v: {
        Row: {
          environment: string | null
          id: string | null
          is_demo: boolean | null
          observed_at: string | null
          source: string | null
          vnd_per_usd: string | null
        }
        Relationships: []
      }
      published_content_release_v: {
        Row: {
          body: string | null
          description: string | null
          image_attributions: Json | null
          locale: Database["public"]["Enums"]["locale"] | null
          published_at: string | null
          release_id: string | null
          slug: string | null
          source_urls: Json | null
          title: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_release_copies_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "seo_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      published_tours_v: {
        Row: {
          attribution: string | null
          cancellation_policy: string | null
          duration_minutes: number | null
          exclusions: string[] | null
          inclusions: string[] | null
          license: string | null
          locale: Database["public"]["Enums"]["locale"] | null
          meeting_point: string | null
          price_vnd_minor: string | null
          slug: string | null
          source_url: string | null
          stops: Json | null
          summary: string | null
          title: string | null
          tour_id: string | null
          tour_version_id: string | null
          verified_at: string | null
        }
        Relationships: []
      }
      travel_snapshots_v: {
        Row: {
          catalog_snapshot_id: string | null
          edges: Json | null
          snapshot_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_snapshots_catalog_snapshot_id_fkey"
            columns: ["catalog_snapshot_id"]
            isOneToOne: false
            referencedRelation: "catalog_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_guide_assignment: {
        Args: { p_assignment_id: string }
        Returns: {
          assignment_id: string
          status: Database["public"]["Enums"]["assignment_status"]
        }[]
      }
      admin_user_summary: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      advance_authenticated_trip_plan_revision: {
        Args: {
          base_revision_no: number
          persistence_dto: Json
          plan_id: string
        }
        Returns: {
          revision_id: string
          revision_no: number
        }[]
      }
      advance_trip_plan_revision: {
        Args: {
          base_revision_no: number
          persistence_dto: Json
          plan_id: string
        }
        Returns: {
          revision_id: string
          revision_no: number
        }[]
      }
      assign_fixed_departure_guide: {
        Args: {
          booking_id: string
          guide_user_id: string
          idempotency_key: string
        }
        Returns: Database["public"]["CompositeTypes"]["guide_assignment_mutation_result"][]
        SetofOptions: {
          from: "*"
          to: "guide_assignment_mutation_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      assign_guide: {
        Args: { booking_id: string; guide_user_id: string }
        Returns: {
          assignment_id: string
          status: Database["public"]["Enums"]["assignment_status"]
        }[]
      }
      begin_fixed_tour_booking: {
        Args: {
          booking_locale: Database["public"]["Enums"]["locale"]
          departure_id: string
          idempotency_key: string
          party_size: number
        }
        Returns: {
          booking_id: string
          hold_expires_at: string
          state: string
        }[]
      }
      cancel_booking: {
        Args: {
          booking_id: string
          idempotency_key?: string
          other_reason?: string
          reason_code?: string
        }
        Returns: Database["public"]["CompositeTypes"]["booking_cancellation_result"][]
        SetofOptions: {
          from: "*"
          to: "booking_cancellation_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_guest_plan: {
        Args: {
          p_pepper_version: number
          p_plan_id: string
          p_token_hash: string
        }
        Returns: {
          claimed_at: string
          plan_id: string
        }[]
      }
      complete_guide_assignment: {
        Args: { p_assignment_id: string }
        Returns: {
          assignment_id: string
          status: Database["public"]["Enums"]["assignment_status"]
        }[]
      }
      complete_simulated_fixed_tour_payment: {
        Args: { booking_id: string; idempotency_key: string }
        Returns: Database["public"]["CompositeTypes"]["simulated_payment_result"][]
        SetofOptions: {
          from: "*"
          to: "simulated_payment_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_authenticated_trip_plan: {
        Args: { p_plan_id: string; persistence_dto: Json }
        Returns: {
          plan_id: string
          revision_no: number
        }[]
      }
      create_custom_quote: {
        Args: {
          amount_vnd_minor: number
          checkout_currency: Database["public"]["Enums"]["checkout_currency"]
          policy: string
          request_id: string
          title_en: string
          title_vi: string
        }
        Returns: {
          quote_id: string
          status: Database["public"]["Enums"]["quote_status"]
          valid_until: string
        }[]
      }
      decide_fixed_tour_cancellation: {
        Args: {
          decision: string
          idempotency_key: string
          note: string
          request_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["fixed_tour_cancellation_decision_result"][]
        SetofOptions: {
          from: "*"
          to: "fixed_tour_cancellation_decision_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fail_seo_publish: {
        Args: {
          p_build_id: string
          p_capability_nonce: string
          p_failure_code: string
          p_release_id: string
        }
        Returns: {
          release_id: string
          status: Database["public"]["Enums"]["content_status"]
        }[]
      }
      finalize_seo_publish: {
        Args: {
          p_artifact_hash: string
          p_build_id: string
          p_capability_nonce: string
          p_release_id: string
          p_source_commit: string
        }
        Returns: {
          published_at: string
          release_id: string
          status: Database["public"]["Enums"]["content_status"]
        }[]
      }
      get_admin_eligible_guides: {
        Args: never
        Returns: {
          display_name: string
          guide_user_id: string
          language: Database["public"]["Enums"]["locale"]
        }[]
      }
      get_admin_food_catalog_review_queue: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          audit_history: Json | null
          item: Json | null
          item_id: string | null
          place_id: string | null
          vendor: Json | null
          vendor_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_food_catalog_review_v"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_admin_guide_assignment_queue: {
        Args: never
        Returns: {
          assignment_id: string
          assignment_status: Database["public"]["Enums"]["assignment_status"]
          booking_id: string
          departure_id: string
          end_at: string
          guide_display_name: string
          guide_user_id: string
          language: Database["public"]["Enums"]["locale"]
          meeting_point: string
          party_size: number
          start_at: string
          title_en: string
          title_vi: string
          tour_version_id: string
        }[]
      }
      get_guide_assigned_bookings: {
        Args: never
        Returns: {
          assignment_id: string
          assignment_status: Database["public"]["Enums"]["assignment_status"]
          booking_id: string
          departure_id: string
          dietary_flags: string[]
          end_at: string
          language: Database["public"]["Enums"]["locale"]
          meeting_point: string
          mobility_flags: string[]
          party_size: number
          start_at: string
          title: string
          tour_version_id: string
        }[]
      }
      get_live_departure_availability: {
        Args: never
        Returns: {
          end_at: string
          id: string
          remaining_capacity: number
          start_at: string
          status: Database["public"]["Enums"]["departure_status"]
          tour_version_id: string
        }[]
      }
      get_portal_identity: {
        Args: never
        Returns: {
          display_name: string
          language: Database["public"]["Enums"]["locale"]
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      publish_seo: {
        Args: { p_build_id: string; p_source_commit: string }
        Returns: {
          build_id: string
          capability_nonce: string
          expires_at: string
          read_scope: string
          release_id: string
        }[]
      }
      read_seo_build_release: {
        Args: {
          p_build_id: string
          p_capability_nonce: string
          p_release_id: string
        }
        Returns: {
          body: string
          description: string
          image_attributions: Json
          locale: Database["public"]["Enums"]["locale"]
          slug: string
          source_urls: Json
          title: string
          verified_at: string
        }[]
      }
      reconcile_payment: {
        Args: {
          p_booking_id: string
          p_resolution: Database["public"]["Enums"]["booking_status"]
        }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      request_fixed_tour_cancellation: {
        Args: { booking_id: string; idempotency_key: string; reason: string }
        Returns: Database["public"]["CompositeTypes"]["fixed_tour_cancellation_request_result"][]
        SetofOptions: {
          from: "*"
          to: "fixed_tour_cancellation_request_result"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reserve_ai_quota: {
        Args: {
          p_device_hash: string
          p_ip_hash: string
          p_kind: string
          p_reservation_id: string
        }
        Returns: {
          bucket_hashes: string[]
          kind: string
          period_start: string
          reservation_id: string
          state: string
        }[]
      }
      review_custom_request: {
        Args: {
          decision: Database["public"]["Enums"]["request_status"]
          note: string
          request_id: string
        }
        Returns: {
          reviewed_request_id: string
          status: Database["public"]["Enums"]["request_status"]
        }[]
      }
      review_food_catalog_item: {
        Args: {
          p_checklist: Json
          p_decision: string
          p_item_id: string
          p_rejection_note: string
          p_vendor_id: string
        }
        Returns: {
          audit_history: Json | null
          item: Json | null
          item_id: string | null
          place_id: string | null
          vendor: Json | null
          vendor_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_food_catalog_review_v"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_custom_request: {
        Args: { plan_id: string; revision_no: number }
        Returns: {
          request_id: string
          status: Database["public"]["Enums"]["request_status"]
        }[]
      }
      upsert_content_draft: {
        Args: {
          p_body: string
          p_description: string
          p_image_attributions: Json
          p_locale: Database["public"]["Enums"]["locale"]
          p_slug: string
          p_source_urls: Json
          p_title: string
          p_verified_at: string
        }
        Returns: {
          body: string
          description: string
          id: string
          image_attributions: Json
          locale: Database["public"]["Enums"]["locale"]
          slug: string
          source_urls: Json
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
          verified_at: string
        }[]
      }
    }
    Enums: {
      app_role: "customer" | "guide" | "admin"
      assignment_status: "assigned" | "accepted" | "completed" | "closed"
      audit_event_type:
        | "role_provisioned"
        | "role_revoked"
        | "plan_claimed"
        | "request_submitted"
        | "request_changes_requested"
        | "request_approved"
        | "request_rejected"
        | "quote_created"
        | "quote_checkout_started"
        | "quote_accepted"
        | "quote_reactivated"
        | "quote_expired"
        | "quote_revoked"
        | "checkout_started"
        | "checkout_session_recorded"
        | "checkout_compensated"
        | "booking_status_changed"
        | "webhook_processed"
        | "webhook_ignored"
        | "webhook_failed"
        | "webhook_conflict"
        | "payment_reconciled"
        | "guide_assigned"
        | "guide_reassigned"
        | "guide_accepted"
        | "guide_completed"
        | "content_publish_started"
        | "content_published"
        | "content_publish_failed"
      audit_metadata_key:
        | "role"
        | "source"
        | "status"
        | "state"
        | "decision"
        | "provider"
        | "currency"
        | "count"
        | "revision"
        | "attempt_no"
        | "amount_minor"
        | "replayed"
        | "is_demo"
      audit_target_type:
        | "user"
        | "trip_plan"
        | "custom_request"
        | "custom_quote"
        | "checkout_attempt"
        | "booking"
        | "payment"
        | "webhook_event"
        | "guide_assignment"
        | "content_release"
        | "catalog_snapshot"
        | "tour_version"
        | "departure"
      booking_status:
        | "pending_payment"
        | "payment_processing"
        | "confirmed"
        | "payment_failed"
        | "payment_review"
        | "expired"
        | "cancelled"
        | "completed"
      checkout_currency: "vnd" | "usd"
      content_status: "draft" | "publishing" | "published" | "failed"
      currency_code: "VND" | "USD"
      departure_status: "scheduled" | "sold_out" | "cancelled" | "completed"
      hold_status: "active" | "consumed" | "released" | "expired"
      locale: "en" | "vi"
      payment_status: "pending" | "paid" | "failed" | "review"
      place_status: "draft" | "published" | "archived"
      quote_status:
        | "active"
        | "checkout_pending"
        | "accepted"
        | "expired"
        | "revoked"
      ranking_source: "ai" | "deterministic"
      request_status:
        | "draft"
        | "pending_review"
        | "changes_requested"
        | "approved"
        | "rejected"
      snapshot_status: "building" | "published" | "retired"
      tour_status: "draft" | "published" | "archived"
      tour_version_status: "draft" | "published" | "retired"
      webhook_event_status:
        | "received"
        | "processed"
        | "ignored"
        | "failed"
        | "conflict"
    }
    CompositeTypes: {
      booking_cancellation_result: {
        id: string | null
        booking_id: string | null
        customer_user_id: string | null
        source_kind: string | null
        reason_code: string | null
        other_reason: string | null
        idempotency_key: string | null
        cancelled_at: string | null
        booking_status: Database["public"]["Enums"]["booking_status"] | null
        state: string | null
      }
      fixed_tour_cancellation_decision_result: {
        request_id: string | null
        booking_id: string | null
        request_status: string | null
        booking_status: Database["public"]["Enums"]["booking_status"] | null
        decision_note: string | null
        decided_at: string | null
        state: string | null
      }
      fixed_tour_cancellation_request_result: {
        request_id: string | null
        booking_id: string | null
        status: string | null
        reason: string | null
        requested_at: string | null
        state: string | null
      }
      guide_assignment_mutation_result: {
        assignment_id: string | null
        booking_id: string | null
        guide_user_id: string | null
        status: Database["public"]["Enums"]["assignment_status"] | null
        outcome: string | null
      }
      simulated_payment_result: {
        booking_id: string | null
        booking_status: Database["public"]["Enums"]["booking_status"] | null
        payment_status: Database["public"]["Enums"]["payment_status"] | null
        simulated_at: string | null
        state: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["customer", "guide", "admin"],
      assignment_status: ["assigned", "accepted", "completed", "closed"],
      audit_event_type: [
        "role_provisioned",
        "role_revoked",
        "plan_claimed",
        "request_submitted",
        "request_changes_requested",
        "request_approved",
        "request_rejected",
        "quote_created",
        "quote_checkout_started",
        "quote_accepted",
        "quote_reactivated",
        "quote_expired",
        "quote_revoked",
        "checkout_started",
        "checkout_session_recorded",
        "checkout_compensated",
        "booking_status_changed",
        "webhook_processed",
        "webhook_ignored",
        "webhook_failed",
        "webhook_conflict",
        "payment_reconciled",
        "guide_assigned",
        "guide_reassigned",
        "guide_accepted",
        "guide_completed",
        "content_publish_started",
        "content_published",
        "content_publish_failed",
      ],
      audit_metadata_key: [
        "role",
        "source",
        "status",
        "state",
        "decision",
        "provider",
        "currency",
        "count",
        "revision",
        "attempt_no",
        "amount_minor",
        "replayed",
        "is_demo",
      ],
      audit_target_type: [
        "user",
        "trip_plan",
        "custom_request",
        "custom_quote",
        "checkout_attempt",
        "booking",
        "payment",
        "webhook_event",
        "guide_assignment",
        "content_release",
        "catalog_snapshot",
        "tour_version",
        "departure",
      ],
      booking_status: [
        "pending_payment",
        "payment_processing",
        "confirmed",
        "payment_failed",
        "payment_review",
        "expired",
        "cancelled",
        "completed",
      ],
      checkout_currency: ["vnd", "usd"],
      content_status: ["draft", "publishing", "published", "failed"],
      currency_code: ["VND", "USD"],
      departure_status: ["scheduled", "sold_out", "cancelled", "completed"],
      hold_status: ["active", "consumed", "released", "expired"],
      locale: ["en", "vi"],
      payment_status: ["pending", "paid", "failed", "review"],
      place_status: ["draft", "published", "archived"],
      quote_status: [
        "active",
        "checkout_pending",
        "accepted",
        "expired",
        "revoked",
      ],
      ranking_source: ["ai", "deterministic"],
      request_status: [
        "draft",
        "pending_review",
        "changes_requested",
        "approved",
        "rejected",
      ],
      snapshot_status: ["building", "published", "retired"],
      tour_status: ["draft", "published", "archived"],
      tour_version_status: ["draft", "published", "retired"],
      webhook_event_status: [
        "received",
        "processed",
        "ignored",
        "failed",
        "conflict",
      ],
    },
  },
} as const
