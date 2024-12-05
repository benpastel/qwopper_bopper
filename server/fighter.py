from typing import NamedTuple
from math import pi
from dataclasses import dataclass

import pymunk  # type: ignore

TORSO_SIZE = (164, 254)
CALF_SIZE = (60, 275)
THIGH_SIZE = (60, 142)
ARM_SIZE = (60, 275)
HEAD_SIZE = (80, 153)

# how many pixels from each edge
# are the anchors / joints?
JOINT_OFFSET = CALF_SIZE[0] // 2

TAKE_DAMAGE_COLLISION_TYPE = 1
DEAL_DAMAGE_COLLISION_TYPE = 2

ELASTICITY = 0.05
FRICTION = 0.9

LIMB_MASS = 20
LIMB_MOMENT = LIMB_MASS**4

JOINT_STIFFNESS = 1e7
JOINT_DAMPING = 1e3

# angle of right limb relative to whatever it's attached to
# left limb angles are calculated via reflection
#          /
#         /  this angle
#        /
# ======* - - - -
LIMB_REFERENCE_ANGLES = {"thigh": pi / 4, "calf": -pi / 8, "arm": pi * 3 / 4}
LIMB_MIN_ANGLES = {"thigh": -pi / 2, "calf": -pi, "arm": 0}
LIMB_MAX_ANGLES = {"thigh": pi / 2, "calf": 0, "arm": pi * 5 / 4}


def _encode_position(body: pymunk.Body) -> dict[str, float]:
    """return position + angle as a dict for sending to client"""
    x, y = body.position
    return {"x": x, "y": y, "angle": body.angle}


def _anchor(size: tuple[int, int], top: bool, left: bool) -> tuple[int, int]:
    """
    Return the joint location in local coordinates
    I.e. the offset from the center of the shape at which we should attach another shape
    """
    w, h = size

    if top:
        y_offset = JOINT_OFFSET - h // 2
    else:
        y_offset = h // 2 - JOINT_OFFSET

    if left:
        x_offset = JOINT_OFFSET - w // 2
    else:
        x_offset = w // 2 - JOINT_OFFSET

    return x_offset, y_offset


@dataclass
class Limb:
    body: pymunk.Body
    box: pymunk.Poly

    # the torso-side joint & spring connecting this limb to something else
    # None if the joint & spring have been removed because the limb fell off
    joint: pymunk.PivotJoint | None
    spring: pymunk.DampedRotarySpring | None
    rotary_limit: pymunk.RotaryLimitJoint | None


class Fighter(NamedTuple):
    torso: pymunk.Body
    torso_box: pymunk.Poly

    # limb name (e.g. "rthigh") => Limb
    limbs: dict[str, Limb]

    def position_json(self) -> dict[str, dict[str, float]]:
        """
        Encode position in json for sending to client.
        """
        return {"torso": _encode_position(self.torso)} | {
            name: _encode_position(limb.body) for name, limb in self.limbs.items()
        }

    def take_damage_shapes(self) -> list[pymunk.Shape]:
        """Shapes that take damage if struck by an oppponent."""
        return [
            self.torso_box,
            self.limbs["head"].box,
        ]


def add_limb(
    mass,
    moment,
    size: tuple[int, int],
    attach_body: pymunk.Body,
    attach_size: tuple[int, int],
    is_above: bool,
    is_left: bool,
    reference_angle: float,
    reference_min_angle: float,
    reference_max_angle: float,
    space: pymunk.Space,
) -> Limb:

    body = pymunk.Body(mass=mass, moment=moment)
    body.angle = 0

    box = pymunk.Poly.create_box(body, size=size)
    box.collision_type = DEAL_DAMAGE_COLLISION_TYPE
    box.elasticity = ELASTICITY
    box.friction = FRICTION

    reference_anchor = _anchor(size=attach_size, top=is_above, left=is_left)
    anchor = _anchor(size=size, top=(not is_above), left=is_left)

    x = attach_body.position[0] + reference_anchor[0] - anchor[0]
    y = attach_body.position[1] + reference_anchor[1] - anchor[1]
    body.position = (x, y)

    joint = pymunk.PivotJoint(
        attach_body,
        body,
        reference_anchor,
        anchor,
    )

    rest_angle = -reference_angle if is_left else reference_angle
    min_angle = -reference_min_angle if is_left else reference_min_angle
    max_angle = -reference_max_angle if is_left else reference_max_angle
    if min_angle > max_angle:
        min_angle, max_angle = max_angle, min_angle

    if is_above:
        spring = pymunk.DampedRotarySpring(
            body, attach_body, rest_angle, JOINT_STIFFNESS, JOINT_DAMPING
        )
        # rotary_limit = pymunk.RotaryLimitJoint(body, attach_body, min_angle, max_angle)
        # TODO: arms case limits aren't working yet
        rotary_limit = None
    else:
        spring = pymunk.DampedRotarySpring(
            attach_body, body, rest_angle, JOINT_STIFFNESS, JOINT_DAMPING
        )
        rotary_limit = pymunk.RotaryLimitJoint(attach_body, body, min_angle, max_angle)
        space.add(rotary_limit)
    space.add(body, box, joint, spring)

    return Limb(body, box, joint, spring, rotary_limit)


def add_fighter(
    space: pymunk.Space, group: int, start_position: tuple[int, int]
) -> Fighter:
    start_x, start_y = start_position

    torso = pymunk.Body(mass=LIMB_MASS, moment=LIMB_MOMENT)
    torso.position = (start_x, start_y)

    torso_box = pymunk.Poly.create_box(torso, size=TORSO_SIZE)
    torso_box.group = group
    torso_box.filter = pymunk.ShapeFilter(group=group)
    torso_box.collision_type = TAKE_DAMAGE_COLLISION_TYPE
    torso_box.elasticity = ELASTICITY
    space.add(torso, torso_box)

    head = pymunk.Body(mass=LIMB_MASS, moment=LIMB_MOMENT)

    head_box = pymunk.Poly.create_box(head, size=HEAD_SIZE)
    head_box.group = group
    head_box.filter = pymunk.ShapeFilter(group=group)
    head_box.collision_type = TAKE_DAMAGE_COLLISION_TYPE
    head_box.elasticity = ELASTICITY
    space.add(head, head_box)

    # attach bottom of head to top of torso
    head_anchor = (0, HEAD_SIZE[1] // 2 - JOINT_OFFSET)
    torso_anchor = (0, JOINT_OFFSET - TORSO_SIZE[1] // 2)
    joint = pymunk.PivotJoint(
        head,
        torso,
        head_anchor,
        torso_anchor,
    )
    head.position = (start_x, start_y + torso_anchor[1] - head_anchor[1])

    spring = pymunk.DampedRotarySpring(head, torso, 0, JOINT_STIFFNESS, JOINT_DAMPING)
    space.add(joint, spring)
    limbs = {"head": Limb(head, head_box, joint, spring, rotary_limit=None)}

    # add left & right of all limbs
    for is_left in [False, True]:
        prefix = "l" if is_left else "r"

        limbs[f"{prefix}arm"] = add_limb(
            mass=LIMB_MASS,
            moment=LIMB_MOMENT,
            size=ARM_SIZE,
            attach_body=torso,
            attach_size=TORSO_SIZE,
            is_above=True,
            is_left=is_left,
            reference_angle=LIMB_REFERENCE_ANGLES["arm"],
            reference_min_angle=LIMB_REFERENCE_ANGLES["arm"],
            reference_max_angle=LIMB_REFERENCE_ANGLES["arm"],
            space=space,
        )

        limbs[f"{prefix}thigh"] = thigh = add_limb(
            mass=LIMB_MASS,
            moment=LIMB_MOMENT,
            size=THIGH_SIZE,
            attach_body=torso,
            attach_size=TORSO_SIZE,
            is_above=False,
            is_left=is_left,
            reference_angle=LIMB_REFERENCE_ANGLES["thigh"],
            reference_min_angle=LIMB_MIN_ANGLES["thigh"],
            reference_max_angle=LIMB_MAX_ANGLES["thigh"],
            space=space,
        )

        limbs[f"{prefix}calf"] = add_limb(
            mass=LIMB_MASS,
            moment=LIMB_MOMENT,
            size=CALF_SIZE,
            attach_body=thigh.body,
            attach_size=THIGH_SIZE,
            is_above=False,
            is_left=is_left,
            reference_angle=LIMB_REFERENCE_ANGLES["calf"],
            reference_min_angle=LIMB_MIN_ANGLES["calf"],
            reference_max_angle=LIMB_MAX_ANGLES["calf"],
            space=space,
        )

    for limb in limbs.values():
        limb.box.group = group
        limb.box.filter = pymunk.ShapeFilter(group=group)

    return Fighter(torso, torso_box, limbs)
