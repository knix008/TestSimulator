#pragma once
#include <glib.h>

typedef struct {
    const char *city;     /* Korean name */
    const char *country;
    const char *tz_id;    /* IANA timezone ID */
    const char *city_en;  /* English name */
} CityInfo;

extern const CityInfo  city_db[];
extern const int       city_db_count;

/* Returns GPtrArray<CityInfo*>, free with g_ptr_array_unref() */
GPtrArray *city_search(const char *query, int max_results);
