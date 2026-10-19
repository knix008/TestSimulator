/* C — the spell checker looks at comments and strings only (see 설정).
   This commnt contains a misteak on purpose. */
#include <stdio.h>
#include <stdlib.h>

#define MAX_ITEMS 16

typedef struct {
    int id;
    const char *name;
} item_t;

static int compare(const void *a, const void *b) {
    return ((const item_t *)a)->id - ((const item_t *)b)->id;   // ascending by id
}

int main(int argc, char **argv) {
    item_t items[MAX_ITEMS] = { { 3, "three" }, { 1, "one" }, { 2, "two" } };
    qsort(items, 3, sizeof(item_t), compare);
    for (int i = 0; i < 3; i++) printf("%d %s\n", items[i].id, items[i].name);
    printf("Helo wrold from %s\n", argc > 0 ? argv[0] : "?");   /* misspelled string */
    return EXIT_SUCCESS;
}
