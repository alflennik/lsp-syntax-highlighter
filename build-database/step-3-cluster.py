import sqlite3
import os
from collections import defaultdict, namedtuple
import numpy as np
from kmedoids import KMedoids

cluster_count = 3000

db_path = os.path.join(os.getcwd(), "data.db")

connection = sqlite3.connect(db_path)
db = connection.cursor()

result = db.execute("""
    SELECT 
        scopes.name AS scope_name,
        themes.name AS theme_name,
        color
    FROM colors
    INNER JOIN themes ON colors.theme_id = themes.id
    INNER JOIN scopes ON colors.scope_id = scopes.id
    ORDER BY scope_name ASC
""")

colors = result.fetchall()

colors_by_theme_by_scope = defaultdict(dict)

for scope_name, theme_name, color in colors:
    colors_by_theme_by_scope[scope_name][theme_name] = color

def custom_distance(colors_by_theme_by_scope1, colors_by_theme_by_scope2):
    colors_by_theme1 = colors_by_theme_by_scope1[1]
    colors_by_theme2 = colors_by_theme_by_scope2[1]
    same_count = 0
    count = 0
    for theme_name, color1 in colors_by_theme1.items():
        count += 1
        if theme_name not in colors_by_theme2:
            continue
        color2 = colors_by_theme2[theme_name]
        if color1 == color2:
            same_count += 1

    ratio = same_count / count
    distance = 1 - ratio
    return distance

X = np.array(list(colors_by_theme_by_scope.items()))

kmedoids = KMedoids(
    n_clusters=cluster_count,
    metric=custom_distance,
    random_state=99
)

kmedoids.fit(X)

cluster_dict = defaultdict(list)

for point_position, cluster_label in enumerate(kmedoids.labels_):
    cluster_dict[cluster_label].append(X[point_position])

clusters = list(cluster_dict.values())

well_known_mappings = {
    # Mandated by me
    "default": "default",
    
    # Built into VSCode
    # "namespace": "entity.name.namespace",
    # "type": "entity.name.type",
    # "type.defaultLibrary": "support.type",
    # "struct": "storage.type.struct",
    # "class": "entity.name.type.class",
    # "class.defaultLibrary": "support.class",
    # "interface": "entity.name.type.interface",
    # "enum": "entity.name.type.enum",
    # "function": "entity.name.function",
    # "function.defaultLibrary": "support.function",
    # "method": "entity.name.function.member",
    # "macro": "entity.name.function.preprocessor",
    # "variable": "variable.other.readwrite , entity.name.variable",
    # "variable.readonly": "variable.other.constant",
    # "variable.readonly.defaultLibrary": "support.constant",
    # "parameter": "variable.parameter",
    # "property": "variable.other.property",
    # "property.readonly": "variable.other.constant.property",
    # "enumMember": "variable.other.enummember",
    # "event": "variable.other.event"
}

for cluster in clusters:
    custom_center_point = cluster[0]
    # custom_center_point = None

    # for point in cluster:
    #     if point[0] in well_known_mappings.values():
    #         custom_center_point = point
    #         break
    
    # if custom_center_point is None:
    #     by_depth = defaultdict(list)

    #     for index, point in enumerate(cluster):
    #         scope = point[0]
    #         depth = scope.count(".")
    #         prefix = scope + "."
    #         matches = sum(
    #             other_point[0].startswith(prefix)
    #             for other_point in cluster
    #         )

    #         # Use -index so order of appearance will win a tie when using max()
    #         by_depth[depth].append((matches, -index, point))

    #     smallest_depth = min(by_depth)
    #     custom_center_point = max(by_depth[smallest_depth])[2]

    print(custom_center_point[0])
    for point in cluster:
        print('  ', point[0])

    result = db.execute(f"""
        SELECT id FROM scopes WHERE name = '{custom_center_point[0]}'
    """)
    scope_id = result.fetchone()[0]

    names_formatted = ", ".join(f"'{point[0]}'" for point in cluster)
    
    db.execute(f"""
        UPDATE scopes SET cluster_scope_id = {scope_id} WHERE name in ({names_formatted})
    """)

connection.commit()
connection.close()